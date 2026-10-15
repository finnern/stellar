/**
 * ISS glyph: dark-blue solar arrays with a silver glint sweeping across them, silver modules.
 * Rotated to the direction of travel. In Earth's shadow it is drawn dark, without glint.
 */
export const drawISS = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  t: number,
  sunlit: boolean
) => {
  ctx.save();
  ctx.translate(x, y);

  // Soft silver halo when sunlit
  if (sunlit) {
    const halo = ctx.createRadialGradient(0, 0, 3, 0, 0, 26);
    halo.addColorStop(0, 'rgba(225, 235, 255, 0.5)');
    halo.addColorStop(1, 'rgba(225, 235, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.rotate(angle);
  ctx.scale(1.25, 1.25);

  // Solar arrays: four wings either side of the truss (perpendicular to travel)
  const wings = [-15, -9.5, 4.5, 10];
  const wingW = 5;
  const wingH = 16;
  ctx.fillStyle = sunlit ? '#1a3a8a' : '#0b1430';
  for (const wx of wings) ctx.fillRect(wx, -wingH / 2, wingW, wingH);

  // Solar cell grid
  ctx.strokeStyle = sunlit ? 'rgba(120, 160, 255, 0.55)' : 'rgba(60, 80, 140, 0.4)';
  ctx.lineWidth = 0.4;
  for (const wx of wings) {
    ctx.strokeRect(wx, -wingH / 2, wingW, wingH);
    for (let gy = -wingH / 2 + 2; gy < wingH / 2; gy += 2) {
      ctx.beginPath();
      ctx.moveTo(wx, gy);
      ctx.lineTo(wx + wingW, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(wx + wingW / 2, -wingH / 2);
    ctx.lineTo(wx + wingW / 2, wingH / 2);
    ctx.stroke();
  }

  // Shimmer: a silver glint sweeps diagonally across the arrays every ~2.4 s
  if (sunlit) {
    const phase = (t % 2400) / 2400;
    const cx = -30 + phase * 60;
    const glint = ctx.createLinearGradient(cx - 7, -9, cx + 7, 9);
    glint.addColorStop(0, 'rgba(235, 242, 255, 0)');
    glint.addColorStop(0.5, 'rgba(235, 242, 255, 0.85)');
    glint.addColorStop(1, 'rgba(235, 242, 255, 0)');
    ctx.save();
    ctx.beginPath();
    for (const wx of wings) ctx.rect(wx, -wingH / 2, wingW, wingH);
    ctx.clip();
    ctx.fillStyle = glint;
    ctx.fillRect(-16, -wingH / 2, 32, wingH);
    ctx.restore();
  }

  // Truss
  const metal = (from: string, to: string) => {
    const g = ctx.createLinearGradient(0, -2, 0, 2);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };
  ctx.fillStyle = sunlit ? metal('#f4f6fa', '#9aa4b2') : metal('#3a4150', '#22262f');
  ctx.fillRect(-15.5, -0.9, 31, 1.8);

  // Pressurised modules along the direction of travel (up = forward)
  const body = ctx.createLinearGradient(-2.2, 0, 2.2, 0);
  if (sunlit) {
    body.addColorStop(0, '#c9ced6');
    body.addColorStop(0.45, '#ffffff');
    body.addColorStop(1, '#8e97a4');
  } else {
    body.addColorStop(0, '#2a2f38');
    body.addColorStop(1, '#1a1d24');
  }
  ctx.fillStyle = body;
  ctx.fillRect(-2.2, -9, 4.4, 18);
  ctx.fillRect(-4, 3.5, 8, 2.2); // cross module

  // Radiators (small, light grey)
  ctx.fillStyle = sunlit ? 'rgba(230, 232, 238, 0.9)' : 'rgba(80, 85, 95, 0.9)';
  ctx.fillRect(-1.2, -12.5, 2.4, 3);

  // Forward marker
  ctx.beginPath();
  ctx.moveTo(0, -16);
  ctx.lineTo(-2.5, -13);
  ctx.lineTo(2.5, -13);
  ctx.closePath();
  ctx.fillStyle = '#33c3f0';
  ctx.fill();
  ctx.restore();
};
