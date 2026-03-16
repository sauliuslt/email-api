// Confirm dialogs for destructive actions
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-confirm]');
  if (btn) {
    const message = btn.getAttribute('data-confirm');
    if (!confirm(message)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
});

// Auto-dismiss flash messages after 5 seconds
document.querySelectorAll('.flash-message').forEach(function (el) {
  setTimeout(function () {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(function () { el.remove(); }, 300);
  }, 5000);
});

// Toggle form visibility
document.querySelectorAll('[data-toggle]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var targetId = btn.getAttribute('data-toggle');
    var target = document.getElementById(targetId);
    if (target) {
      target.classList.toggle('hidden');
      if (!target.classList.contains('hidden')) {
        var input = target.querySelector('input');
        if (input) input.focus();
      }
    }
  });
});

// Copy to clipboard
document.querySelectorAll('[data-copy]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var sourceId = btn.getAttribute('data-copy');
    var source = document.getElementById(sourceId);
    if (source) {
      var text = source.textContent || source.value;
      navigator.clipboard.writeText(text).then(function () {
        var original = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(function () { btn.textContent = original; }, 2000);
      });
    }
  });
});
