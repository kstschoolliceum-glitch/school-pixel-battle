/* -------------------------
   МЫШЬ — ПК
------------------------- */

canvas.addEventListener(
  "mousedown",
  (event) => {

    isDragging = true;
    moved = false;

    dragStartX =
      event.clientX;

    dragStartY =
      event.clientY;

    startOffsetX =
      offsetX;

    startOffsetY =
      offsetY;

  }
);


window.addEventListener(
  "mousemove",
  (event) => {

    if (!isDragging) {
      return;
    }

    const dx =
      event.clientX -
      dragStartX;

    const dy =
      event.clientY -
      dragStartY;

    if (
      Math.abs(dx) > 3 ||
      Math.abs(dy) > 3
    ) {
      moved = true;
    }

    offsetX =
      startOffsetX + dx;

    offsetY =
      startOffsetY + dy;

    updateTransform();

  }
);


window.addEventListener(
  "mouseup",
  (event) => {

    if (!isDragging) {
      return;
    }

    isDragging = false;

    if (!moved) {

      selectPixel(
        event.clientX,
        event.clientY
      );

    }

  }
);


/* -------------------------
   ZOOM КОЛЁСИКОМ
------------------------- */

container.addEventListener(
  "wheel",
  (event) => {

    event.preventDefault();

    const oldScale =
      scale;

    const zoom =
      event.deltaY < 0
        ? 1.15
        : 0.87;

    scale *= zoom;

    scale = Math.max(
      0.75,
      Math.min(scale, 12)
    );

    /*
     * Стараемся приблизить карту
     * относительно положения курсора.
     */

    const containerRect =
      container.getBoundingClientRect();

    const mouseX =
      event.clientX -
      containerRect.left -
      containerRect.width / 2;

    const mouseY =
      event.clientY -
      containerRect.top -
      containerRect.height / 2;

    const ratio =
      scale / oldScale;

    offsetX =
      mouseX -
      (mouseX - offsetX) *
      ratio;

    offsetY =
      mouseY -
      (mouseY - offsetY) *
      ratio;

    updateTransform();

  },
  {
    passive: false
  }
);


/* -------------------------
   TOUCH — ТЕЛЕФОН
------------------------- */

let touchStartDistance = null;
let touchStartScale = 1;

let touchStartCenter = null;


function getTouchDistance(
  touch1,
  touch2
) {

  const dx =
    touch2.clientX -
    touch1.clientX;

  const dy =
    touch2.clientY -
    touch1.clientY;

  return Math.sqrt(
    dx * dx +
    dy * dy
  );

}


canvas.addEventListener(
  "touchstart",
  (event) => {

    event.preventDefault();

    if (event.touches.length === 1) {

      const touch =
        event.touches[0];

      isDragging = true;
      moved = false;

      dragStartX =
        touch.clientX;

      dragStartY =
        touch.clientY;

      startOffsetX =
        offsetX;

      startOffsetY =
        offsetY;

    }


    if (event.touches.length === 2) {

      isDragging = false;

      touchStartDistance =
        getTouchDistance(
          event.touches[0],
          event.touches[1]
        );

      touchStartScale =
        scale;

      startOffsetX =
        offsetX;

      startOffsetY =
        offsetY;

      touchStartCenter = {
        x:
          (
            event.touches[0].clientX +
            event.touches[1].clientX
          ) / 2,

        y:
          (
            event.touches[0].clientY +
            event.touches[1].clientY
          ) / 2
      };

    }

  },
  {
    passive: false
  }
);


canvas.addEventListener(
  "touchmove",
  (event) => {

    event.preventDefault();


    if (
      event.touches.length === 1 &&
      isDragging
    ) {

      const touch =
        event.touches[0];

      const dx =
        touch.clientX -
        dragStartX;

      const dy =
        touch.clientY -
        dragStartY;

      if (
        Math.abs(dx) > 4 ||
        Math.abs(dy) > 4
      ) {
        moved = true;
      }

      offsetX =
        startOffsetX + dx;

      offsetY =
        startOffsetY + dy;

      updateTransform();

    }


    if (
  event.touches.length === 2 &&
  touchStartDistance
) {

  const touch1 =
    event.touches[0];

  const touch2 =
    event.touches[1];


  const newDistance =
    getTouchDistance(
      touch1,
      touch2
    );


  const newScale =
    Math.max(
      0.75,
      Math.min(
        touchStartScale *
        (
          newDistance /
          touchStartDistance
        ),
        12
      )
    );


  /*
   * Текущий центр двух пальцев.
   */

  const currentCenter = {

    x:
      (
        touch1.clientX +
        touch2.clientX
      ) / 2,

    y:
      (
        touch1.clientY +
        touch2.clientY
      ) / 2

  };


  const containerRect =
    container.getBoundingClientRect();


  const oldCenterX =
    touchStartCenter.x -
    containerRect.left -
    containerRect.width / 2;

  const oldCenterY =
    touchStartCenter.y -
    containerRect.top -
    containerRect.height / 2;


  const newCenterX =
    currentCenter.x -
    containerRect.left -
    containerRect.width / 2;

  const newCenterY =
    currentCenter.y -
    containerRect.top -
    containerRect.height / 2;


  const ratio =
    newScale /
    touchStartScale;


  /*
   * Сохраняем точку карты между пальцами
   * и одновременно разрешаем двигать
   * центр pinch-жеста.
   */

  offsetX =
    newCenterX -
    (
      oldCenterX -
      startOffsetX
    ) * ratio;


  offsetY =
    newCenterY -
    (
      oldCenterY -
      startOffsetY
    ) * ratio;


  scale =
    newScale;


  updateTransform();

  moved = true;

}

  },
  {
    passive: false
  }
);


canvas.addEventListener(
  "touchend",
  (event) => {

    event.preventDefault();

    if (
      event.touches.length === 0
    ) {

      if (
        isDragging &&
        !moved &&
        event.changedTouches.length > 0
      ) {

        const touch =
          event.changedTouches[0];

        selectPixel(
          touch.clientX,
          touch.clientY
        );

      }

      isDragging = false;
      touchStartDistance = null;

    }

  },
  {
    passive: false
  }
);


/* -------------------------
   RESIZE
------------------------- */

window.addEventListener(
  "resize",
  () => {

    /*
     * Пока при изменении размера окна
     * возвращаем карту в центр.
     */

    calculateInitialScale();

  }
);


/* -------------------------
   ЗАПУСК
------------------------- */

drawMap();

requestAnimationFrame(() => {
  calculateInitialScale();
});

updateCooldown();
