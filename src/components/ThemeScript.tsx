/** Applies the saved theme before first paint to avoid a light/dark flash. */
export function ThemeScript() {
  const code = `(function(){try{var p=localStorage.getItem('smchs-theme');var d=p==='dark'||((!p||p==='system')&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
