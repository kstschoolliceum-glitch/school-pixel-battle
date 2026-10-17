// Only this small listener is loaded with the map. No JAR or VM is fetched here.
(() => {
  const button = document.getElementById('java-games-open');
  if (!button) return;
  let loading = false;
  button.addEventListener('click', async () => {
    if (loading) return;
    loading = true;
    button.disabled = true;
    try {
      const { openGames } = await import('./java-games/catalog.js?v=1');
      await openGames();
    } catch (error) {
      console.error('Java games UI could not load', error);
      alert('Не удалось открыть раздел «Игры». Попробуй ещё раз.');
    } finally {
      loading = false;
      button.disabled = false;
    }
  });
})();
