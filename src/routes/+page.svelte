

<script>
  import { onMount, onDestroy } from 'svelte';

  // ====== Config ======
  const COLS = 10;
  const ROWS = 20;
  const BASE_BLOCK = 28; // visual block size (CSS px) - will scale by DPR
  const START_TIME = 60; // seconds
  const DROP_INTERVAL = 800; // ms initial drop; can be tuned
  const MOBILE_SOFT_DROP_MULT = 0.07; // faster drop when holding down on mobile
  const SCORE_PER_LINE = [0, 100, 300, 500, 800]; // classic-ish scoring

  // Tetromino shapes (0-empty, 1-block)
  const SHAPES = [
    { id: 'I', m: [[1,1,1,1]] },
    { id: 'O', m: [[1,1],[1,1]] },
    { id: 'T', m: [[0,1,0],[1,1,1]] },
    { id: 'S', m: [[0,1,1],[1,1,0]] },
    { id: 'Z', m: [[1,1,0],[0,1,1]] },
    { id: 'J', m: [[1,0,0],[1,1,1]] },
    { id: 'L', m: [[0,0,1],[1,1,1]] }
  ];

  const COLORS = {
    I: '#00f0f0', O: '#f0f000', T: '#a000f0', S: '#00f000', Z: '#f00000', J: '#0000f0', L: '#f0a000'
  };

  // ====== Reactive state ======
  let canvas;
  let ctx;
  let dpr = 1;
  let block = BASE_BLOCK;
  let board = createBoard();
  let current = null;
  let next = randPiece();

  let score = 0;
  let level = 1;
  let timeLeft = START_TIME;
  let running = false;
  let gameOver = false;
  let rewardMsg = '';

  let lastDrop = 0; // timestamp of last automatic drop
  let dropInterval = DROP_INTERVAL;

  // for touch gesture detection
  let touchStartX = null;
  let touchStartY = null;
  let touchStartTime = 0;

  // flag for continuous soft drop (mobile button hold)
  let softDropping = false;

  // Animation frame id
  let rafId;
  let timerId;

  // ====== Utility & game logic ======
  function createBoard() {
    return Array.from({length: ROWS}, () => Array(COLS).fill(0));
  }

  function cloneShape(shape) {
    return shape.map(r => r.slice());
  }

  function randPiece() {
    const s = SHAPES[Math.floor(Math.random()*SHAPES.length)];
    const mat = cloneShape(s.m);
    return {
      id: s.id,
      shape: mat,
      x: Math.floor((COLS - mat[0].length)/2),
      y: 0,
      color: COLORS[s.id]
    };
  }

  function rotateMatrix(matrix) {
    // rotate clockwise
    const h = matrix.length;
    const w = matrix[0].length;
    const res = Array.from({length: w}, () => Array(h).fill(0));
    for (let y=0;y<h;y++) for (let x=0;x<w;x++) res[x][h-1-y] = matrix[y][x];
    return res;
  }

  function collides(board, piece, nx = piece.x, ny = piece.y, shape = piece.shape) {
    for (let y=0;y<shape.length;y++) for (let x=0;x<shape[y].length;x++) {
      if (!shape[y][x]) continue;
      const bx = nx + x;
      const by = ny + y;
      if (bx < 0 || bx >= COLS || by >= ROWS) return true;
      if (by >= 0 && board[by][bx]) return true;
    }
    return false;
  }

  function lockPiece() {
    const s = current.shape;
    for (let y=0;y<s.length;y++) for (let x=0;x<s[y].length;x++) if (s[y][x]) {
      const by = current.y + y;
      const bx = current.x + x;
      if (by >= 0 && by < ROWS && bx >=0 && bx < COLS) board[by][bx] = current.color;
    }
    clearLines();
    current = next;
    next = randPiece();
    if (collides(board, current)) {
      // immediate collision -> game over
      endGame();
    }
  }

  function clearLines() {
    let lines = 0;
    for (let y = ROWS-1; y>=0; y--) {
      if (board[y].every(cell => cell)) {
        board.splice(y,1);
        board.unshift(Array(COLS).fill(0));
        lines++;
        y++; // re-check same index after splice
      }
    }
    if (lines > 0) {
      score += SCORE_PER_LINE[lines] || (lines * 200);
      // level up every 1000 points roughly
      level = 1 + Math.floor(score / 1000);
      // speed up slightly
      dropInterval = Math.max(120, DROP_INTERVAL - (level-1)*60);
    }
  }

  function tick(now) {
    if (!running || gameOver) return;

    // handle automatic drop timing
    if (softDropping) {
      // accelerated drop when holding mobile down
      if (now - lastDrop > 100 * MOBILE_SOFT_DROP_MULT) {
        stepDown();
        lastDrop = now;
      }
    } else if (now - lastDrop > dropInterval) {
      stepDown();
      lastDrop = now;
    }

    render();
    rafId = requestAnimationFrame(tick);
  }

  function stepDown() {
    if (!current) return;
    if (!collides(board, current, current.x, current.y+1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }

  function move(dx) {
    if (!current) return;
    if (!collides(board, current, current.x + dx, current.y)) current.x += dx;
    render();
  }

  function rotatePiece() {
    if (!current) return;
    const rotated = rotateMatrix(current.shape);
    // Try wall kicks (naive): try offsets 0, +1, -1, +2, -2
    const offsets = [0,1,-1,2,-2];
    for (const off of offsets) {
      if (!collides(board, {...current, shape: rotated}, current.x + off, current.y)) {
        current.shape = rotated;
        current.x += off;
        return;
      }
    }
  }

  function hardDrop() {
    if (!current) return;
    while (!collides(board, current, current.x, current.y+1)) current.y++;
    lockPiece();
    render();
  }

  function startGame() {
    board = createBoard();
    current = next;
    next = randPiece();
    score = 0;
    level = 1;
    timeLeft = START_TIME;
    running = true;
    gameOver = false;
    rewardMsg = '';
    dropInterval = DROP_INTERVAL;
    lastDrop = performance.now();

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);

    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!running) return;
      timeLeft--;
      if (timeLeft <= 0) {
        endGame();
      }
    }, 1000);
  }

  function pauseGame() {
    running = false;
  }
  function resumeGame() {
    if (gameOver) return;
    running = true;
    lastDrop = performance.now();
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function endGame() {
    running = false;
    gameOver = true;
    clearInterval(timerId);
    // reward logic (simple local)
    if (score >= 500) {
      rewardMsg = '🎉 You earned a free brownie! Show this screen to the cashier.';
      // try navigator.vibrate for mobile feedback
      if (navigator.vibrate) navigator.vibrate([100,50,100]);
    } else {
      rewardMsg = 'Nice try — score 500+ to get the brownie!';
    }
    render();
  }

  // ====== Rendering ======
  function resizeCanvas() {
    if (!canvas) return;
    dpr = Math.max(1, window.devicePixelRatio || 1);
    // block size scales with viewport width to stay responsive on small screens
    const maxWidth = Math.min(window.innerWidth - 32, 600);
    block = Math.floor(maxWidth / COLS);
    if (block < 16) block = BASE_BLOCK; // fallback

    const cssW = block * COLS;
    const cssH = block * ROWS;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function drawGrid() {
    ctx.fillStyle = '#0f1720';
    ctx.fillRect(0,0, canvas.width/dpr, canvas.height/dpr);

    // draw board cells
    for (let y=0;y<ROWS;y++) for (let x=0;x<COLS;x++) {
      const cell = board[y][x];
      if (cell) {
        drawCell(x,y,cell);
      } else {
        // subtle gridlines
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.strokeRect(x*block+0.5, y*block+0.5, block-1, block-1);
      }
    }
  }

  function drawCell(x,y,color) {
    ctx.fillStyle = color;
    ctx.fillRect(x*block, y*block, block, block);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x*block+0.5, y*block+0.5, block-1, block-1);
  }

  function drawPiecePreview(px, py, pieceObj, scale = 1) {
    // draw small preview (next piece)
    const s = pieceObj.shape;
    for (let y=0;y<s.length;y++) for (let x=0;x<s[y].length;x++) if (s[y][x]) {
      const cx = px + x*block*scale;
      const cy = py + y*block*scale;
      ctx.fillStyle = pieceObj.color;
      ctx.fillRect(cx, cy, block*scale - 2, block*scale - 2);
    }
  }

  function render() {
    if (!ctx) return;
    resizeCanvas();
    drawGrid();

    // draw current piece
    if (current) {
      const s = current.shape;
      for (let y=0;y<s.length;y++) for (let x=0;x<s[y].length;x++) if (s[y][x]) {
        drawCell(current.x + x, current.y + y, current.color);
      }
    }

    // draw ghost (soft drop preview)
    if (current) {
      const ghost = { ...current, y: current.y };
      while (!collides(board, ghost, ghost.x, ghost.y+1)) ghost.y++;
      // draw ghost cells with lower opacity
      const s = ghost.shape;
      ctx.globalAlpha = 0.28;
      for (let y=0;y<s.length;y++) for (let x=0;x<s[y].length;x++) if (s[y][x]) drawCell(ghost.x + x, ghost.y + y, ghost.color);
      ctx.globalAlpha = 1;
    }

    // draw UI text overlay (score/time)
    // We avoid heavy text rendering in canvas; top-left corner only
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = Math.max(12, Math.floor(block*0.6)) + 'px system-ui, sans-serif';
    ctx.fillText(`Score: ${score}`, 6, 18);
    ctx.fillText(`Time: ${timeLeft}s`, 6, 36);
    ctx.fillText(`Level: ${level}`, 6, 54);

    // draw next piece preview (top-right of canvas)
    const previewX = (COLS*block) - (block*4) - 6;
    const previewY = 6;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(previewX - 4, previewY - 4, block*4 + 8, block*3 + 8);
    drawPiecePreview(previewX, previewY, next, 0.8);

    // show reward message overlay if game over
    if (gameOver && rewardMsg) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, (ROWS*block)/2 - 60, COLS*block, 120);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText(rewardMsg, (COLS*block)/2, (ROWS*block)/2);
      ctx.textAlign = 'left';
    }
  }

  // ====== Input handling ======
  function onKey(e) {
    if (gameOver) return;
    if (e.repeat) return;
    switch(e.key) {
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown': stepDown(); break;
      case 'ArrowUp': rotatePiece(); break;
      case ' ': hardDrop(); break;
      case 'p': running = !running; if (running) resumeGame(); else pauseGame(); break;
    }
  }

  function onTouchStart(e) {
    if (gameOver) return;
    const t = e.touches[0];
    touchStartX = t.clientX; touchStartY = t.clientY; touchStartTime = performance.now();
  }
  function onTouchMove(e) {
    if (gameOver) return;
    const t = e.touches[0];
    if (!touchStartX) return;
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    // horizontal swipe threshold
    const hThresh = 24;
    const vThresh = 18;
    if (Math.abs(dx) > hThresh && Math.abs(dx) > Math.abs(dy)) {
      // horizontal move
      if (dx > 0) move(1); else move(-1);
      // reset start to allow continuous swipes
      touchStartX = t.clientX; touchStartY = t.clientY;
    } else if (Math.abs(dy) > vThresh && Math.abs(dy) > Math.abs(dx)) {
      // vertical swipe -> soft drop or rotate (quick up)
      if (dy > 0) {
        // dragging down: soft drop while touch held
        softDropping = true;
      } else {
        // quick up swipe = rotate
        rotatePiece();
        touchStartX = null; touchStartY = null;
      }
    }
  }
  function onTouchEnd(e) {
    // reset soft drop
    softDropping = false;
    touchStartX = null; touchStartY = null;
  }

  // On-screen button handlers (mobile)
  function btnLeft() { move(-1); }
  function btnRight() { move(1); }
  function btnRotate() { rotatePiece(); }
  function btnDownStart() { softDropping = true; }
  function btnDownEnd() { softDropping = false; }
  function btnDrop() { hardDrop(); }

  // ====== Lifecycle ======
  onMount(() => {
    ctx = canvas.getContext('2d');
    resizeCanvas();
    render();

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('keydown', onKey);

    canvas.addEventListener('touchstart', onTouchStart, {passive: true});
    canvas.addEventListener('touchmove', onTouchMove, {passive: true});
    canvas.addEventListener('touchend', onTouchEnd, {passive: true});
  });

  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    window.removeEventListener('keydown', onKey);
    canvas && canvas.removeEventListener('touchstart', onTouchStart);
    canvas && canvas.removeEventListener('touchmove', onTouchMove);
    canvas && canvas.removeEventListener('touchend', onTouchEnd);
    cancelAnimationFrame(rafId);
    clearInterval(timerId);
  });
</script>

<style>
  :global(body) {
    margin: 0; font-family: Inter, system-ui, Arial, sans-serif; -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale; background: linear-gradient(180deg,#0b1220 0%, #0f1720 100%);
    color: #e6eef8;
  }

  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    box-sizing: border-box;
  }

  .card {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 16px;
    align-items: start;
    background: rgba(255,255,255,0.03);
    padding: 14px;
    border-radius: 12px;
    box-shadow: 0 6px 30px rgba(2,6,23,0.6);
    max-width: 960px;
    width: 100%;
  }

  .left {
    display:flex; flex-direction:column; align-items:center; gap:12px;
  }
  .meta { text-align: center; }
  h1 { margin: 0; font-size: 18px; }
  p.lead { margin: 0; opacity: 0.8; font-size: 13px }

  canvas { border-radius: 8px; touch-action: none; }

  .controls { display:flex; gap:8px; flex-wrap:wrap; justify-content:center }
  .controls button {
    min-width: 44px; min-height: 44px; border-radius: 10px; border: none; background: #ff7a00;
    color: white; font-weight:600; box-shadow: 0 6px 18px rgba(0,0,0,0.35); cursor: pointer;
  }

  .right {
    width: 180px; display:flex; flex-direction:column; gap:10px; align-items:center; padding:0 6px;
  }
  .stat { width:100%; background: rgba(255,255,255,0.02); padding:8px; border-radius:8px; text-align:center }

  .mobile-controls {
    display:flex; gap:8px; margin-top:8px; justify-content:center; width:100%;
  }
  .btn-ghost { background: rgba(255,255,255,0.06); color: #fff; }

  @media (max-width:720px) {
    .card { grid-template-columns: 1fr; }
    .right { order: 2; width: 100%; flex-direction:row; justify-content:space-between }
    .controls { flex-wrap:nowrap; }
  }
</style>

<div class="page">
  <div class="card">
    <div class="left">
      <div class="meta">
        <h1>🍫 Brownie Tetris</h1>
        <p class="lead">Score {score} — Time {timeLeft}s — Level {level}</p>
      </div>

      <canvas bind:this={canvas} aria-label="Tetris game board"></canvas>

      <div class="controls" role="group" aria-label="game controls">
        <button on:click={startGame}>Start</button>
        <button on:click={() => { running = !running; running ? resumeGame() : pauseGame(); }}>{running ? 'Pause' : 'Resume'}</button>
        <button on:click={() => { board = createBoard(); score = 0; gameOver = false; rewardMsg=''; render(); }}>Reset</button>
        <button on:click={() => { navigator.vibrate && navigator.vibrate(50); }}>Vibe</button>
      </div>

      <!-- Mobile-friendly big controls -->
      <div class="mobile-controls" style="margin-top:6px">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn-ghost" on:click={btnLeft} aria-label="move left">◀</button>
          <button class="btn-ghost" on:click={btnRotate} aria-label="rotate">⤴</button>
          <button class="btn-ghost" on:mousedown={btnDownStart} on:mouseup={btnDownEnd} on:touchstart|preventDefault={btnDownStart} on:touchend|preventDefault={btnDownEnd} aria-label="soft drop">▼</button>
          <button class="btn-ghost" on:click={btnRight} aria-label="move right">▶</button>
        </div>
        <button on:click={btnDrop} style="min-width:84px">Hard Drop</button>
      </div>

    </div>

    <div class="right">
      <div class="stat">Next</div>
      <div class="stat">Best: 0000</div>
      <div class="stat">Reward: {score >= 500 ? 'Eligible' : 'Score 500+'}</div>
      <div style="width:100%">
        {#if gameOver}
          <div style="background: rgba(255,255,255,0.03); padding:8px; border-radius:6px; text-align:center">
            <strong>Game Over</strong>
            <div style="margin-top:8px">{rewardMsg}</div>
            <div style="margin-top:8px"><button on:click={() => { startGame(); }}>Play Again</button></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
