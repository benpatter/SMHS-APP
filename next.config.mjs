/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export so the same build runs as a PWA and is wrapped by Capacitor
  // for iOS/Android. The app is entirely local-first — no server runtime needed.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    // Forced to a literal at build time so the minifier can dead-code-eliminate
    // the test-account and demo-tool branches from production bundles entirely.
    // (An undefined NEXT_PUBLIC_* var stays a runtime lookup and defeats DCE.)
    NEXT_PUBLIC_TEST_ACCOUNTS: process.env.NEXT_PUBLIC_TEST_ACCOUNTS || '0',
  },
};

export default nextConfig;
