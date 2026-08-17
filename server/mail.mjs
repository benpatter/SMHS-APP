/**
 * Staff email over raw SMTP — Node built-ins only (this server has no npm
 * runtime dependencies). The wire mode follows the credentials and the port:
 *
 *   SMTP_USER + SMTP_PASS set
 *     465             implicit TLS (SMTPS): encrypted from the first byte
 *     anything else   submission with STARTTLS (587, 25): plain greeting,
 *                     MANDATORY upgrade to TLS, then AUTH — credentials
 *                     never travel unencrypted, and a server that refuses
 *                     STARTTLS fails the send instead of falling back
 *
 *   neither set (anonymous relay, e.g. a district's internal send-only
 *   relay on port 25)
 *     465             implicit TLS, no AUTH
 *     anything else   plain SMTP, no AUTH — the message (which carries the
 *                     setup link) crosses the local network unencrypted, so
 *                     this is only for a relay on a network you trust
 *
 *   exactly one set   hard error — a typo must not silently downgrade an
 *                     authenticated setup to plaintext
 *
 * Throws on any SMTP error; callers fall back to demo mode.
 */
import net from 'node:net';
import tls from 'node:tls';

export function sendMail(to, subject, body) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST) return Promise.reject(new Error('SMTP not configured'));
  if (Boolean(SMTP_USER) !== Boolean(SMTP_PASS))
    return Promise.reject(new Error('SMTP_USER and SMTP_PASS must be set together (leave both empty for an anonymous relay)'));
  if (!SMTP_FROM && !SMTP_USER)
    return Promise.reject(new Error('Set SMTP_FROM: an anonymous relay has no SMTP_USER to fall back to for the sender'));
  const hasAuth = Boolean(SMTP_USER);
  const port = Number(SMTP_PORT) || 465;
  // SMTP_FROM may be a bare address or a display form ("SMCHS App <x@y>", as
  // .env.example ships). The MAIL FROM envelope must be the bare address —
  // servers reject nested angle brackets — while the From: header keeps the
  // display form.
  const fromRaw = SMTP_FROM || SMTP_USER;
  const angled = fromRaw.match(/<([^<>\s]+)>/);
  const fromAddr = angled ? angled[1] : fromRaw;
  const fromHeader = angled ? fromRaw : `SMCHS App <${fromRaw}>`;
  const payload =
    `From: ${fromHeader}\r\nTo: <${to}>\r\nSubject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    // DATA lines must end CRLF, and a body line starting with "." must be
    // dot-stuffed or it would terminate (or corrupt) the section.
    `${body.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..')}\r\n.\r\n`;

  // The envelope/DATA exchange is the same in every mode; only what precedes
  // MAIL FROM differs (a 235 auth acceptance, or the 250 EHLO reply itself).
  const mailSteps = (okBefore) => [
    { wait: okBefore, send: `MAIL FROM:<${fromAddr}>\r\n` },
    { wait: /^250 /m, send: `RCPT TO:<${to}>\r\n` },
    { wait: /^250 /m, send: `DATA\r\n` },
    { wait: /^354 /m, send: payload },
    { wait: /^250 /m, send: `QUIT\r\n` },
  ];
  // With credentials, AUTH always runs on an encrypted socket (see header).
  const sessionSteps = hasAuth
    ? [
        { wait: /^250 /m, send: `AUTH LOGIN\r\n` },
        { wait: /^334 /m, send: `${Buffer.from(SMTP_USER).toString('base64')}\r\n` },
        { wait: /^334 /m, send: `${Buffer.from(SMTP_PASS).toString('base64')}\r\n` },
        ...mailSteps(/^235 /m),
      ]
    : mailSteps(/^250 /m);

  return new Promise((resolve, reject) => {
    // Walk one request/response step list over a socket, then call next().
    // Any 4xx/5xx reply aborts the whole send (destroy → 'error' → reject).
    const drive = (socket, steps, next) => {
      let i = 0;
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString();
        if (/^[45]\d\d[ -]/m.test(buf)) return socket.destroy(new Error(`SMTP: ${buf.trim()}`));
        if (i < steps.length && steps[i].wait.test(buf)) {
          const step = steps[i];
          buf = '';
          i += 1;
          if (step.send) socket.write(step.send);
          if (i === steps.length) {
            socket.removeListener('data', onData);
            next();
          }
        }
      };
      socket.on('data', onData);
    };
    const arm = (socket) => {
      socket.setTimeout(15000, () => socket.destroy(new Error('SMTP timeout')));
      socket.on('error', reject);
      return socket;
    };
    const finish = (socket) => {
      socket.end();
      resolve();
    };

    if (port === 465) {
      const socket = arm(tls.connect({ host: SMTP_HOST, port, servername: SMTP_HOST }));
      drive(socket, [{ wait: /^220 /m, send: `EHLO smhs-app\r\n` }, ...sessionSteps], () => finish(socket));
    } else if (hasAuth) {
      const plain = arm(net.connect({ host: SMTP_HOST, port }));
      drive(
        plain,
        [
          { wait: /^220 /m, send: `EHLO smhs-app\r\n` },
          { wait: /^250 /m, send: `STARTTLS\r\n` },
          { wait: /^220 /m }, // server is ready for the TLS handshake
        ],
        () => {
          // Hand the raw socket to TLS. The plain socket's timeout/error
          // handlers come off first so the send has one owner at a time.
          plain.setTimeout(0);
          plain.removeListener('error', reject);
          const socket = arm(tls.connect({ socket: plain, servername: SMTP_HOST }));
          // After the handshake the server says nothing — the client re-EHLOs.
          socket.write(`EHLO smhs-app\r\n`);
          drive(socket, sessionSteps, () => finish(socket));
        },
      );
    } else {
      // Anonymous relay: plain SMTP end to end, nothing secret on the wire
      // beyond the message itself (see header for what that implies).
      const socket = arm(net.connect({ host: SMTP_HOST, port }));
      drive(socket, [{ wait: /^220 /m, send: `EHLO smhs-app\r\n` }, ...sessionSteps], () => finish(socket));
    }
  });
}
