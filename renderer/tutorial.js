const slides = Array.from(document.querySelectorAll('.slide'));
const dotsContainer = document.getElementById('dots');
const nextBtn = document.getElementById('nextBtn');
const skipBtn = document.getElementById('skipBtn');

let current = 0;

slides.forEach((_, i) => {
  const dot = document.createElement('div');
  dot.className = 'dot';
  dotsContainer.appendChild(dot);
});
const dots = Array.from(dotsContainer.children);

function show(index) {
  slides.forEach((slide, i) => {
    slide.classList.remove('active', 'leaving');
    if (i === index) slide.classList.add('active');
    else if (i === current) slide.classList.add('leaving');
  });
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));

  nextBtn.textContent = index === slides.length - 1 ? "Got it" : 'Next';
  current = index;
}

function goNext() {
  if (current < slides.length - 1) {
    show(current + 1);
  } else {
    finish();
  }
}

function finish() {
  window.ghostDropTutorial.markSeen();
  window.ghostDropTutorial.close();
}

nextBtn.addEventListener('click', goNext);
skipBtn.addEventListener('click', finish);

show(0);
