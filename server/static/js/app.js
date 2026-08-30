// Preview the chosen photo before upload. No network calls, no third-party code.
(function () {
  var input = document.getElementById('photo');
  var drop = document.getElementById('drop');
  var preview = document.getElementById('preview');
  if (!input || !drop || !preview) return;

  function show(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('That file is larger than the 8 MB upload cap.');
      input.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function (e) {
      preview.src = e.target.result;
      drop.classList.add('has');
    };
    reader.readAsDataURL(file);
  }

  input.addEventListener('change', function () { show(input.files[0]); });
  ['dragover', 'dragenter'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = '#6ee787'; });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = ''; });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      show(e.dataTransfer.files[0]);
    }
  });
})();
