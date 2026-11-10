/* Offline if vendor file is present; otherwise fetch a pinned upstream build on first use. */
(function () {
  const urls = [
    '/static/vendor/opensheetmusicdisplay.min.js',
    'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.2.1/build/opensheetmusicdisplay.min.js'
  ];
  let loading;
  window.loadOSMD = function() {
    if (window.opensheetmusicdisplay?.OpenSheetMusicDisplay) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      for (const url of urls) {
        try {
          await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload = resolve;
            script.onerror = () => { script.remove(); reject(new Error('Script unavailable: '+url)); };
            document.head.appendChild(script);
          });
          if (window.opensheetmusicdisplay?.OpenSheetMusicDisplay) return;
        } catch (error) { /* fallback to the next source */ }
      }
      throw new Error('Cannot load OpenSheetMusicDisplay. Check internet access or install its JS bundle locally.');
    })();
    return loading;
  };
})();
