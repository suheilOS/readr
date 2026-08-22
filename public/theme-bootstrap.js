(() => {
  let theme = "light";

  try {
    const storedTheme = localStorage.getItem("reader:theme");
    theme = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  } catch {
    theme = "light";
  } finally {
    document.documentElement.dataset.theme = theme;
  }
})();
