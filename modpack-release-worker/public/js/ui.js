// 全站通用：移动端折叠导航
(function () {
  var toggle = document.getElementById('navToggle');
  var fold = document.getElementById('navFold');
  if (!toggle || !fold) return;

  toggle.addEventListener('click', function () {
    var open = fold.classList.toggle('open');
    toggle.textContent = open ? '✕' : '☰';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // 点击折叠面板链接后自动收起
  fold.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      fold.classList.remove('open');
      toggle.textContent = '☰';
    }
  });
})();
