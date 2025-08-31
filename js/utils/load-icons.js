fetch('/resources/icons/icons.svg')
  .then(r => r.text())
  .then(svg => {
    const div = document.createElement('div');
    div.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    div.innerHTML = svg;
    document.body.prepend(div);
  });
