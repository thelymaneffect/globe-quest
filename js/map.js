/* Lyman Learning: Globe Quest — map renderer (2D map + 3D globe on one canvas) */
(function () {
  const R_KM = 6371;
  const COL = {
    ocean: '#bfe0f2', oceanEdge: '#9fcbe6', sphere: '#a9d4ee', grat: 'rgba(255,255,255,.45)',
    lake: '#bfe0f2', river: '#4f97cf', neutral: '#e4ddd0', border: 'rgba(255,255,255,.85)',
    empireBorder: '#1d2a3a', label: '#1d2a3a', halo: 'rgba(255,255,255,.9)',
    mountain: '#7a5230', desert: '#a07a2c', hover: '#f2b632'
  };

  // Ocean and sea names. Oceans always show; seas show once you zoom in a little.
  const WATERS = [
    ['Pacific Ocean', -150, 5, 1], ['Pacific Ocean', 165, 15, 1], ['Pacific Ocean', -125, 33, 1], ['Atlantic Ocean', -40, 28, 1], ['Atlantic Ocean', -18, -18, 1],
    ['Atlantic Ocean', -68, 33, 1], ['Indian Ocean', 78, -22, 1], ['Arctic Ocean', 10, 84, 1], ['Arctic Ocean', -150, 76, 1], ['Southern Ocean', 30, -62, 1], ['Southern Ocean', -120, -64, 1],
    ['Gulf of Mexico', -90.5, 25.5, 0], ['Caribbean Sea', -75, 14.5, 0], ['Mediterranean Sea', 18, 34.5, 0], ['Arabian Sea', 64, 14, 0], ['Bay of Bengal', 89, 14, 0],
    ['South China Sea', 114, 12, 0], ['Coral Sea', 156, -17, 0], ['Bering Sea', -178, 57, 0], ['Hudson Bay', -85, 60, 0], ['Red Sea', 38.5, 20.5, 0],
    ['Black Sea', 34, 43.3, 0], ['Caspian Sea', 50.5, 41.5, 0], ['North Sea', 3.5, 56, 0], ['Baltic Sea', 19.5, 57.5, 0], ['Sea of Japan', 135, 40, 0],
    ['Tasman Sea', 160, -38, 0], ['Gulf of Alaska', -145, 56.5, 0], ['Labrador Sea', -55, 59, 0], ['Philippine Sea', 133, 20, 0], ['Gulf of Guinea', 3, 1.5, 0]
  ];

  // Small East Coast states: when their name won't fit inside, it goes out in the Atlantic with a pointer line.
  const CALLOUTS = { NH: [-68.6, 43.0], VT: [-67.6, 44.0], MA: [-68.7, 41.9], RI: [-69.6, 40.9], CT: [-70.9, 40.3],
    NJ: [-72.2, 39.5], DE: [-72.9, 38.6], MD: [-73.3, 37.7] };

  // A lighter copy of a shape (fewer points) used only while the globe is spinning, so it moves instantly.
  function liteFeature(f, step = 1.5) {
    const g = f.geometry; if (!g || g.type === 'Point') return f;
    const thin = (ring) => {
      const out = [ring[0]]; let [lx, ly] = ring[0];
      for (let i = 1; i < ring.length - 1; i++) { const [x, y] = ring[i]; if (Math.abs(x - lx) + Math.abs(y - ly) > step) { out.push(ring[i]); lx = x; ly = y; } }
      out.push(ring[ring.length - 1]);
      return out.length >= 4 ? out : null;
    };
    const poly = (rings) => { const r = rings.map(thin).filter(Boolean); return r.length ? r : null; };
    let lite;
    if (g.type === 'Polygon') { const p = poly(g.coordinates); lite = p ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: p } } : f; }
    else { const ps = g.coordinates.map(poly).filter(Boolean); lite = ps.length ? { type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: ps } } : f; }
    // safety check: if simplifying turned the shape inside-out (it would cover the whole globe), keep the original
    const a0 = d3.geoArea(f), a1 = d3.geoArea(lite);
    return a1 > 2 * Math.PI || Math.abs(a1 - a0) > Math.max(a0 * 0.5, 1e-5) ? f : lite;
  }

  // same idea for border lines
  function liteLines(mesh, step) {
    if (!mesh) return mesh;
    const lines = (mesh.type === 'MultiLineString' ? mesh.coordinates : [mesh.coordinates]).map((line) => {
      const out = [line[0]]; let [lx, ly] = line[0];
      for (let i = 1; i < line.length - 1; i++) { const [x, y] = line[i]; if (Math.abs(x - lx) + Math.abs(y - ly) > step) { out.push(line[i]); lx = x; ly = y; } }
      out.push(line[line.length - 1]); return out;
    });
    return { type: 'MultiLineString', coordinates: lines };
  }

  function largestPolygon(f) {
    const g = f.geometry; if (!g) return null;
    if (g.type !== 'MultiPolygon') return f;
    let best = null, ba = -1;
    for (const coords of g.coordinates) {
      const p = { type: 'Polygon', coordinates: coords }; const a = d3.geoArea(p);
      if (a > ba) { ba = a; best = p; }
    }
    return best;
  }
  function largestPolygonCentroid(f) {
    const g = f.geometry; if (!g) return null;
    if (g.type === 'Point') return g.coordinates;
    return d3.geoCentroid(largestPolygon(f));
  }

  // The slow math for one country or state (size, center, simpler copies for the globe).
  // game.js runs this a little at a time while the title screen is showing, so the map opens fast.
  function prepFeature(f) {
    if (f._prep) return; f._prep = true;
    f.o = f.properties.o; f.nm = f.properties.n;
    f.area = f.geometry.type === 'Point' ? 0 : d3.geoArea(f);
    f.bounds = d3.geoBounds(f);
    f.lp = largestPolygonCentroid(f); f.mainPoly = largestPolygon(f);
    f.lite = liteFeature(f); f.mid = liteFeature(f, 0.45); // simpler copies for the globe
  }

  class GameMap {
    static prepFeature(f) { prepFeature(f); }

    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.view = '2d'; this.t = d3.zoomIdentity; this.rot = [0, -10]; this.k3 = 1;
      this.colorOf = () => COL.neutral; this.empireOf = () => null; this.highlight = new Set();
      this.flash = new Map(); this.hover = null; this.onClick = null; this.onHover = null; this.onZoom = null;
      this.detail = null; // places/rivers etc, loaded lazily
      this.zoom = d3.zoom().scaleExtent([1, 60]).clickDistance(6)
        .on('start', (e) => { if (e.sourceEvent) this._moving = true; })
        .on('zoom', (e) => this._zoomed(e))
        .on('end', () => { if (this._moving) { this._moving = false; this.draw(); } });
      this.sel = d3.select(canvas).call(this.zoom).on('dblclick.zoom', null);
      canvas.addEventListener('click', (e) => this._click(e));
      canvas.addEventListener('mousemove', (e) => this._move(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; this.onHover && this.onHover(null); this.draw(); });
      window.addEventListener('resize', () => this.resize());
      // also redraw when the map area itself changes size (for example when the top bar gets taller)
      if (window.ResizeObserver) new ResizeObserver(() => { const r = canvas.getBoundingClientRect(); if (this.mode && r.width && (Math.abs(r.width - this.w) > 1 || Math.abs(r.height - this.h) > 1)) this.resize(); }).observe(canvas);
      this._raf = null;
    }

    setMode(mode, features, topo, objName) {
      this.mode = mode; this.features = features; this.topo = topo; this.objName = objName;
      this.byRegion = new Map();
      for (const f of features) {
        prepFeature(f); // usually already done in the background while the title screen was showing
        if (f.o) { if (!this.byRegion.has(f.o)) this.byRegion.set(f.o, []); this.byRegion.get(f.o).push(f); }
      }
      this.sphere = { type: 'Sphere' };
      this.graticule = d3.geoGraticule10();
      this.empireMesh = null;
      this._sortedForLabels = null; this._lakesBySize = null; // forget the previous mode's lists
      this.resize();
      this.resetView(false);
    }

    regionArea(code) { // km²
      const fs = this.byRegion.get(code) || [];
      const main = fs.find(f => f.id === code) || fs[0];
      return main ? main.area * R_KM * R_KM : 0;
    }
    regionLabelPoint(code) {
      const fs = this.byRegion.get(code) || []; const main = fs.find(f => f.id === code) || fs[0];
      return main ? main.lp : null;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.w = Math.max(200, r.width); this.h = Math.max(200, r.height);
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = this.w * this.dpr; this.canvas.height = this.h * this.dpr;
      this._buildProjections();
      this.zoom.extent([[0, 0], [this.w, this.h]]);
      if (this.view === '2d') this.zoom.translateExtent(this._extent2d());
      this.draw();
    }

    _buildProjections() {
      const pad = 14, ext = [[pad, pad], [this.w - pad, this.h - pad]];
      if (!this.mode) return;
      if (this.mode === 'us') {
        this.p2 = d3.geoAlbersUsa().fitExtent(ext, { type: 'FeatureCollection', features: this.features });
        this.center3 = [96, -38];
      } else {
        this.p2 = d3.geoNaturalEarth1().fitExtent(ext, this.sphere);
        this.center3 = [-10, -20];
      }
      this.base3 = Math.min(this.w, this.h) / 2 - 18;
      this._pc = new WeakMap(); this._svg = d3.geoPath(this.p2); this._landBox = null; // saved flat-map shapes (reset when the map is resized)
      this.p3 = d3.geoOrthographic().clipAngle(90).precision(0.4).translate([this.w / 2, this.h / 2]);
    }

    // the flat map can only be dragged as far as the map's own edges (never off into empty space)
    _extent2d() {
      if (!this.p2) return [[0, 0], [this.w, this.h]];
      // stop at the land itself (not the empty ocean above the Arctic), so zooming in can never get lost in blue
      if (!this._landBox) {
        // measured once per map at scale 1 (slow), then just stretched to the screen size (instant)
        const fs = this.features, s = this.p2.scale(), [tx, ty] = this.p2.translate();
        if (!fs._unitBox) {
          const [[a, b], [c, d]] = d3.geoPath(this.p2).bounds({ type: 'FeatureCollection', features: fs });
          fs._unitBox = [[(a - tx) / s, (b - ty) / s], [(c - tx) / s, (d - ty) / s]];
        }
        const u = fs._unitBox;
        this._landBox = [[tx + u[0][0] * s, ty + u[0][1] * s], [tx + u[1][0] * s, ty + u[1][1] * s]];
      }
      const [[x0, y0], [x1, y1]] = this._landBox;
      return [[x0 - 4, y0 - 4], [x1 + 4, y1 + 4]];
    }

    setView(v) {
      this.view = v;
      if (v === '2d') { this.zoom.translateExtent(this._extent2d()).scaleExtent([1, 60]); }
      else { this.zoom.translateExtent([[-1e7, -1e7], [1e7, 1e7]]).scaleExtent([0.8, 60]); }
      this.resetView(false);
    }

    resetView(animate = true) {
      if (this.view === '3d') {
        this._suppress = true; this.sel.call(this.zoom.transform, d3.zoomIdentity); this._suppress = false;
        this._last = { x: 0, y: 0 }; this.k3 = this.mode === 'us' ? 2.2 : 1;
        this._suppress = true; this.sel.call(this.zoom.transform, d3.zoomIdentity.scale(this.k3)); this._suppress = false;
        this._last = { x: 0, y: 0 };
        const target = this.center3.slice();
        if (animate) this._tweenRot(target, this.k3); else { this.rot = target; this.draw(); }
      } else {
        if (animate) this.sel.transition().duration(600).call(this.zoom.transform, d3.zoomIdentity);
        else { this.sel.call(this.zoom.transform, d3.zoomIdentity); }
      }
    }

    zoomBy(f) {
      if (this.view === '2d') this.sel.transition().duration(300).call(this.zoom.scaleBy, f, [this.w / 2, this.h / 2]);
      else this.sel.transition().duration(300).call(this.zoom.scaleBy, f);
    }

    _zoomed(e) {
      const t = e.transform;
      if (this.view === '2d') { this.t = t; }
      else {
        // a zoom (wheel or pinch) also shifts the transform; only a real drag (same zoom) turns the globe
        if (!this._suppress && this._last && Math.abs(t.k - this.k3) < 1e-9) {
          const dx = t.x - this._last.x, dy = t.y - this._last.y;
          const s = 0.25 / this.k3 * (this.base3 > 0 ? 400 / this.base3 : 1);
          this.rot = [this.rot[0] + dx * s, Math.max(-85, Math.min(85, this.rot[1] - dy * s))];
        }
        this._last = { x: t.x, y: t.y }; this.k3 = t.k;
        // when zoomed in, never let the view drift past the northernmost land into empty Arctic ocean
        if (this.mode !== 'us' && !this._suppress) {
          const halfDeg = (this.h / 2) / (this.base3 * this.k3) * 180 / Math.PI;
          const maxN = Math.min(85, 76 + halfDeg);
          if (-this.rot[1] > maxN) this.rot = [this.rot[0], -maxN];
        }
      }
      this.onZoom && this.onZoom(this.effZoom());
      this.draw();
    }

    effZoom() { return (this.view === '2d' ? this.t.k : this.k3) * (this.mode === 'us' ? (this.view === '2d' ? 4 : 1.8) : 1); }

    _proj() {
      if (this.view === '2d') return this.p2;
      return this.p3.scale(this.base3 * this.k3).rotate([this.rot[0], this.rot[1]]).precision(this._moving ? 2 : 0.4);
    }

    // screen px -> [lon,lat]
    _invert(px, py) {
      if (this.view === '2d') { const [x, y] = this.t.invert([px, py]); return this.p2.invert([x, y]); }
      const p = this._proj(); const ll = p.invert([px, py]);
      if (!ll) return null;
      const c = [-this.rot[0], -this.rot[1]];
      if (d3.geoDistance(ll, c) > Math.PI / 2) return null;
      const back = p(ll); if (!back || Math.hypot(back[0] - px, back[1] - py) > 2) return null;
      return ll;
    }
    // [lon,lat] -> screen px
    _toScreen(ll) {
      if (!ll) return null;
      if (this.view === '2d') { const p = this.p2(ll); return p ? this.t.apply(p) : null; }
      const c = [-this.rot[0], -this.rot[1]];
      if (d3.geoDistance(ll, c) > Math.PI / 2 - 0.02) return null;
      return this._proj()(ll);
    }

    _pxScale() { return this.view === '2d' ? this.p2.scale() * this.t.k : this.base3 * this.k3; }

    hitTest(px, py) {
      const scale = this._pxScale();
      // tiny places (markers) first
      let best = null, bd = 14;
      for (const f of this.features) {
        if (!this._isTiny(f, scale)) continue;
        const s = this._toScreen(f.lp); if (!s) continue;
        const d = Math.hypot(s[0] - px, s[1] - py); if (d < bd) { bd = d; best = f; }
      }
      if (best) return best;
      const ll = this._invert(px, py); if (!ll) return null;
      for (const f of this.features) {
        if (f.geometry.type === 'Point') continue;
        const b = f.bounds; const [lon, lat] = ll;
        if (lat < b[0][1] - 0.5 || lat > b[1][1] + 0.5) continue;
        if (b[0][0] <= b[1][0] && (lon < b[0][0] - 0.5 || lon > b[1][0] + 0.5)) continue;
        if (d3.geoContains(f, ll)) return f;
      }
      return null;
    }

    _click(e) {
      const r = this.canvas.getBoundingClientRect();
      const f = this.hitTest(e.clientX - r.left, e.clientY - r.top);
      if (f && f.o && this.onClick) this.onClick(f.o, f);
    }
    _move(e) {
      if (e.buttons) return;
      const r = this.canvas.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      if (this._hoverPending) { this._hoverXY = [x, y]; return; }
      this._hoverPending = true; this._hoverXY = [x, y];
      requestAnimationFrame(() => {
        this._hoverPending = false;
        const f = this.hitTest(...this._hoverXY);
        const code = f && f.o ? f.o : null;
        if (code !== (this.hover && this.hover.o)) { this.hover = f && f.o ? f : null; this.draw(); }
        this.onHover && this.onHover(this.hover, this._hoverXY);
      });
    }

    invalidateBorders() { this.empireMesh = null; }

    // fly to a spot on Earth at "region" zoom (used by the blue location arrow); returns false if it's off this map
    flyToPoint(ll) {
      if (this.view === '2d') {
        const p = this.p2(ll); if (!p) return false;
        const k = this.mode === 'us' ? 2.6 : 6;
        this.sel.transition().duration(1000).call(this.zoom.transform, d3.zoomIdentity.translate(this.w / 2, this.h / 2).scale(k).translate(-p[0], -p[1]));
      } else this._tweenRot([-ll[0], -ll[1]], this.mode === 'us' ? 6 : 5);
      return true;
    }
    regionAt(ll) {
      for (const f of this.features) if (f.o && f.geometry.type !== 'Point' && d3.geoContains(f, ll)) return f.o;
      return null;
    }

    // the rest of the world, drawn in gray behind the playable places (used in USA Mode)
    setBackdrop(fc) {
      this.backdrop = fc ? fc.features : null;
      if (this.backdrop) for (const f of this.backdrop) { f.area = d3.geoArea(f); f.lp = largestPolygonCentroid(f); }
      this._backdropLabels = this.backdrop ? this.backdrop.filter((f) => f.area > 2e-3).sort((a, b) => b.area - a.area) : null;
    }

    flyTo(code) {
      const fs = this.byRegion.get(code); if (!fs) return;
      const main = fs.find(f => f.id === code) || fs[0];
      if (this.view === '2d') {
        const path = d3.geoPath(this.p2);
        let [[x0, y0], [x1, y1]] = path.bounds(main.mainPoly || main);
        if (!isFinite(x0)) { const p = this.p2(main.lp); if (!p) return; x0 = p[0] - 5; x1 = p[0] + 5; y0 = p[1] - 5; y1 = p[1] + 5; }
        const k = Math.max(1, Math.min(18, 0.5 / Math.max((x1 - x0) / this.w, (y1 - y0) / this.h)));
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const t = d3.zoomIdentity.translate(this.w / 2, this.h / 2).scale(k).translate(-cx, -cy);
        this.sel.transition().duration(900).call(this.zoom.transform, t);
      } else {
        const ll = main.lp; if (!ll) return;
        const deg = Math.sqrt(d3.geoArea(main.mainPoly || main)) * 57.3 || 1;
        const k = Math.max(1, Math.min(14, 40 / Math.max(deg, 2)));
        this._tweenRot([-ll[0], -ll[1]], k);
      }
    }
    _tweenRot(target, k) {
      const r0 = this.rot.slice(), k0 = this.k3;
      // shortest way around
      let dl = ((target[0] - r0[0] + 540) % 360) - 180; const t1 = [r0[0] + dl, target[1]];
      const ir = d3.interpolate(r0, t1), ik = d3.interpolate(k0, k);
      if (this._timer) this._timer.stop();
      this._moving = true;
      this._timer = d3.timer((ms) => {
        const tt = Math.min(1, ms / 900), e = d3.easeCubicInOut(tt);
        this.rot = ir(e); this.k3 = ik(e); this.draw();
        if (tt >= 1) {
          this._timer.stop(); this._moving = false; this.draw();
          this._suppress = true; this.sel.call(this.zoom.transform, d3.zoomIdentity.scale(this.k3)); this._suppress = false;
          this._last = { x: 0, y: 0 };
          this.onZoom && this.onZoom(this.effZoom());
        }
      });
    }

    pulse(codes) { // flash newly changed regions
      const start = performance.now();
      for (const c of codes) this.flash.set(c, start);
      const tick = () => { this.draw(); if (performance.now() - start < 1600) requestAnimationFrame(tick); else { for (const c of codes) this.flash.delete(c); this.draw(); } };
      requestAnimationFrame(tick);
    }

    draw() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => { this._raf = null; this._render(); this._drawHere(this.ctx); this.onRender && this.onRender(); });
    }

    _p2d(obj) {
      let p = this._pc.get(obj);
      if (!p) { p = new Path2D(this._svg(obj) || ''); this._pc.set(obj, p); }
      return p;
    }

    _render() {
      const ctx = this.ctx, dpr = this.dpr; if (!this.features) return;
      const is2d = this.view === '2d';
      const proj = this._proj();
      const k = is2d ? this.t.k : 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, this.w, this.h);
      // background
      if (is2d) {
        ctx.fillStyle = this.mode === 'us' ? '#cfe6f3' : '#b6d9ee'; ctx.fillRect(0, 0, this.w, this.h);
        ctx.setTransform(dpr * this.t.k, 0, 0, dpr * this.t.k, dpr * this.t.x, dpr * this.t.y);
      } else {
        ctx.fillStyle = '#0f1d33'; ctx.fillRect(0, 0, this.w, this.h);
        // stars
        ctx.fillStyle = 'rgba(255,255,255,.6)';
        for (let i = 0; i < 80; i++) { const x = (i * 97.3 % 1) * this.w + (i * 53) % this.w, y = (i * 61) % this.h; ctx.fillRect(x % this.w, y, 1.4, 1.4); }
      }
      const path = d3.geoPath(proj, ctx);
      const lw = 1 / k;
      const light = !is2d && this._moving; // spinning globe: simple outlines, details come back when it stops
      const zoomedOutGlobe = !is2d && this.k3 < 2.5; // fine detail is too small to see when zoomed out
      // draw a set of shapes: flat map re-uses saved shapes; the globe projects them fresh
      const shapes = (objs, op) => {
        if (is2d) { const P = new Path2D(); for (const o of objs) P.addPath(this._p2d(o)); ctx[op](P); }
        else { ctx.beginPath(); for (const o of objs) path(light && o.lite ? o.lite : (zoomedOutGlobe && o.mid ? o.mid : o)); ctx[op](); }
      };
      // ocean sphere
      if (this.mode !== 'us' || !is2d) {
        if (is2d) { ctx.beginPath(); ctx.fillStyle = COL.ocean; ctx.fill(this._p2d(this.sphere)); }
        else ctx.beginPath(), path(this.sphere);
        if (!is2d) {
          const g = ctx.createRadialGradient(this.w / 2 - proj.scale() * .3, this.h / 2 - proj.scale() * .3, proj.scale() * .1, this.w / 2, this.h / 2, proj.scale());
          g.addColorStop(0, '#d4ecf8'); g.addColorStop(1, '#8cc4e3'); ctx.fillStyle = g;
          ctx.fill();
        }
        ctx.strokeStyle = COL.grat; ctx.lineWidth = lw * 0.8; shapes([this.graticule], 'stroke');
      }
      const eff = this.effZoom();
      const scale = this._pxScale();
      // rest-of-world backdrop (USA Mode): soft gray land with thin borders, not clickable
      if (this.backdrop) {
        ctx.fillStyle = '#e6e1d6'; shapes(this.backdrop, 'fill');
        if (!light) { ctx.strokeStyle = 'rgba(120,120,120,.55)'; ctx.lineWidth = lw * 0.6; shapes(this.backdrop, 'stroke'); }
      }
      // land fills — every shape of the same color is filled in one go, so no seams show inside an empire
      const byColor = new Map();
      for (const f of this.features) {
        if (f.geometry.type === 'Point') continue;
        let c = f.o ? this.colorOf(f.o) : COL.neutral;
        const fl = f.o && this.flash.get(f.o);
        if (fl) { const ph = ((performance.now() - fl) / 200) | 0; if (ph % 2 === 0) c = '#ffffff'; }
        if (!byColor.has(c)) byColor.set(c, []); byColor.get(c).push(f);
      }
      for (const [c, fs] of byColor) { ctx.fillStyle = c; shapes(fs, 'fill'); }
      // lakes
      if (this.detail && !light) {
        ctx.fillStyle = COL.lake; shapes(this.detail.lakes.features, 'fill');
        ctx.strokeStyle = 'rgba(79,151,207,.6)'; ctx.lineWidth = lw * 0.6; shapes(this.detail.lakes.features, 'stroke');
      }
      // Borders are only drawn between DIFFERENT empires. Once neighbors belong to the same empire,
      // the old border between them is erased. Recomputed whenever ownership changes.
      if (!this.empireMesh) {
        const obj = this.topo.objects[this.objName];
        const emp = (g) => (g.properties.o ? this.empireOf(g.properties.o) || g.properties.o : 'x' + g.id);
        const mine = (g) => !!(g.properties.o && this.highlight.has(g.properties.o));
        this.empireMesh = topojson.mesh(this.topo, obj, (a, b) => a !== b && emp(a) !== emp(b));
        this.coastMesh = topojson.mesh(this.topo, obj, (a, b) => a === b);
        this.playerMesh = this.highlight.size ? topojson.mesh(this.topo, obj, (a, b) => (a === b ? mine(a) : mine(a) !== mine(b))) : null;
        this.empireMesh.mid = liteLines(this.empireMesh, 0.45); this.coastMesh.mid = liteLines(this.coastMesh, 0.45);
        if (this.playerMesh) this.playerMesh.mid = liteLines(this.playerMesh, 0.45);
      }
      if (!light) {
        ctx.strokeStyle = 'rgba(29,42,58,.6)'; ctx.lineWidth = lw * 1; shapes([this.empireMesh], 'stroke');
        ctx.strokeStyle = 'rgba(29,42,58,.45)'; ctx.lineWidth = lw * 0.8; shapes([this.coastMesh], 'stroke');
      }
      // outline the player's whole empire (outer edge only)
      if (this.playerMesh && !light) {
        ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = lw * 2.4; shapes([this.playerMesh], 'stroke');
        ctx.strokeStyle = 'rgba(29,42,58,.8)'; ctx.lineWidth = lw * 0.9; shapes([this.playerMesh], 'stroke');
      }
      // hover
      if (this.hover && this.hover.o && !light) {
        ctx.strokeStyle = COL.hover; ctx.lineWidth = lw * 3; shapes(this.byRegion.get(this.hover.o) || [], 'stroke');
      }
      // rivers
      if (this.detail && eff >= 1.4 && !light) {
        const maxRank = Math.min(10, 1.5 + eff * 1.3);
        ctx.strokeStyle = COL.river; ctx.lineWidth = lw * (eff > 5 ? 1.4 : 1);
        shapes(this.detail.rivers.features.filter((r) => r.properties.r <= maxRank), 'stroke');
      }
      // --- screen-space overlays ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // tiny region markers
      for (const f of this.features) {
        if (!this._isTiny(f, scale)) continue;
        const s = this._toScreen(f.lp); if (!s) continue;
        const r = this.hover && this.hover.o === f.o ? 7 : 5;
        ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
        ctx.fillStyle = this.colorOf(f.o); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = this.highlight.has(f.o) ? '#fff' : '#1d2a3a'; ctx.stroke();
      }
      const labels = []; // collision avoidance
      const tryLabel = (x, y, w, h) => {
        const b = [x - w / 2 - 2, y - h / 2 - 1, x + w / 2 + 2, y + h / 2 + 1];
        for (const o of labels) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
        labels.push(b); return true;
      };
      const text = (str, x, y, font, color, haloW = 3) => {
        ctx.font = font; ctx.lineJoin = 'round'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = COL.halo; ctx.lineWidth = haloW; ctx.strokeText(str, x, y);
        ctx.fillStyle = color; ctx.fillText(str, x, y);
      };
      const drawPlaces = (wantStars) => {
        if (!this.detail || light) return;
        const showCap = this.mode === 'us' ? eff >= 5.5 : eff >= 2.2;
        const showCity = this.mode === 'us' ? eff >= 5.5 : eff >= 2.6;
        if (wantStars ? !showCap : !showCity) return;
        // how many of each place's top-5 cities to show at this zoom
        const topN = this.mode === 'us' ? (eff >= 9 ? 5 : eff >= 7 ? 3 : 2) : (eff >= 5 ? 5 : eff >= 3.6 ? 3 : 2);
        const list = wantStars ? this.detail.places.map((p) => [p[0], p[1], p[2], p[3]])
          : this.detail.cities.filter((c) => c[3] <= topN).map((c) => [c[0], c[1], c[2], 0]);
        for (const p of list) {
          const [name, lon, lat, cap] = p;
          const isStar = wantStars;
          const s = this._toScreen([lon, lat]); if (!s || s[0] < -20 || s[1] < -20 || s[0] > this.w + 20 || s[1] > this.h + 20) continue;
          const fs = isStar ? 12 : 10.5;
          ctx.font = `${isStar ? 800 : 700} ${fs}px Nunito, sans-serif`;
          const tw = ctx.measureText(name).width;
          // name goes right, left, below or above the marker — wherever it fits
          const spots = [[s[0] + tw / 2 + 9, s[1], 'left', s[0] + 9, s[1]], [s[0] - tw / 2 - 9, s[1], 'right', s[0] - 9, s[1]],
            [s[0], s[1] + fs, 'center', s[0], s[1] + fs], [s[0], s[1] - fs, 'center', s[0], s[1] - fs]];
          const spot = spots.find((sp) => tryLabel(sp[0], sp[1], tw + 12, fs + 2));
          // zoomed in close, every marker shows even without room for its name; zoomed out, only labeled ones (keeps the map tidy)
          const close = this.mode === 'us' ? eff >= 9 : eff >= 4.5;
          if (!spot && !close) continue;
          if (isStar) this._star(ctx, s[0], s[1], cap === 2 ? 7 : 6, '#d62828');
          else { ctx.beginPath(); ctx.arc(s[0], s[1], 3.2, 0, 7); ctx.fillStyle = '#111'; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
          if (!spot) continue;
          ctx.textAlign = spot[2]; ctx.font = `${isStar ? 800 : 700} ${fs}px Nunito, sans-serif`;
          ctx.strokeStyle = COL.halo; ctx.lineWidth = 3; ctx.lineJoin = 'round';
          ctx.strokeText(name, spot[3], spot[4]); ctx.fillStyle = '#1d2a3a'; ctx.fillText(name, spot[3], spot[4]);
        }
      };
      // region names
      const seen = new Set();
      const sorted = this._sortedForLabels || (this._sortedForLabels = this.features.filter(f => f.o).slice().sort((a, b) => b.area - a.area));
      for (const f of sorted) {
        if (seen.has(f.o) || f.id !== f.o) continue;
        // labelPlan decides: hide a conquered place's name when it joined its conqueror's land,
        // or show the conqueror's name on a far-away conquered place
        const plan = this.labelPlan ? this.labelPlan(f.o) : null;
        if (plan && plan.hide) continue;
        const sizePx = Math.sqrt(plan && plan.area ? plan.area : f.area) * scale;
        let name = plan && plan.text ? plan.text : (this.labelName ? this.labelName(f.o) : f.nm);
        let fsz = 14; // every country and state name the same size (bigger than capitals 12, cities 10.5, landforms 10)
        ctx.font = `800 ${fsz}px Nunito, sans-serif`;
        let tw = ctx.measureText(name).width;
        if (sizePx < tw * 0.9 && this.mode === 'us' && CALLOUTS[f.o]) { // pointer label out in the ocean
          const from = this._toScreen(plan && plan.at ? plan.at : f.lp), to = this._toScreen(CALLOUTS[f.o]);
          if (from && to) {
            ctx.font = '800 12px Nunito, sans-serif'; const w2 = ctx.measureText(name).width;
            if (tryLabel(to[0] + w2 / 2 + 4, to[1], w2 + 8, 14)) {
              ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]);
              ctx.strokeStyle = 'rgba(29,42,58,.65)'; ctx.lineWidth = 1.2; ctx.stroke();
              ctx.beginPath(); ctx.arc(from[0], from[1], 2.5, 0, 7); ctx.fillStyle = '#1d2a3a'; ctx.fill();
              ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
              ctx.strokeStyle = COL.halo; ctx.lineWidth = 3.5; ctx.strokeText(name, to[0] + 4, to[1]);
              ctx.fillStyle = COL.label; ctx.fillText(name, to[0] + 4, to[1]);
              seen.add(f.o); continue;
            }
          }
        }
        if (sizePx < tw * 0.9) { // doesn't fit: try a smaller size, then the short name (e.g. "RI")
          {
            const short = !(plan && plan.text) && this.labelShort ? this.labelShort(f.o) : null;
            if (!short) continue;
            name = short; tw = ctx.measureText(name).width;
            if (sizePx < tw * 0.8) continue;
          }
        }
        const s = this._toScreen(plan && plan.at ? plan.at : f.lp); if (!s) continue;
        if (!tryLabel(s[0], s[1], tw, fsz)) continue;
        seen.add(f.o);
        text(name, s[0], s[1], `800 ${fsz}px Nunito, sans-serif`, COL.label, 3.5);
      }
      // lake names — biggest lakes first, and only lakes big enough on screen for their name
      if (this.detail && !light) {
        const lakes = this._lakesBySize || (this._lakesBySize = this.detail.lakes.features.filter((l) => l.properties.n)
          .map((l) => { l._a = d3.geoArea(l); l._c = d3.geoCentroid(largestPolygon(l)); return l; }).sort((a, b) => b._a - a._a));
        for (const l of lakes) {
          const nm = l.properties.n, px = Math.sqrt(l._a) * scale;
          ctx.font = 'italic 700 10px Nunito, sans-serif'; const tw = ctx.measureText(nm).width;
          if (px < tw * 0.75) continue; // too small on screen for its name
          const s = this._toScreen(l._c); if (!s || s[0] < 0 || s[1] < 0 || s[0] > this.w || s[1] > this.h) continue;
          // long, narrow lakes (like Lake Michigan): slide the name up or down inside the lake to find room
          for (const dy of [0, -14, 14, -28, 28]) {
            const y = s[1] + dy;
            if (dy && !(this._invert(s[0], y) && d3.geoContains(l, this._invert(s[0], y)))) continue;
            if (tryLabel(s[0], y, tw, 12)) { text(nm, s[0], y, 'italic 700 10px Nunito, sans-serif', '#2a6ea8'); break; }
          }
        }
      }
      // 0) oceans and seas
      for (const [name, lon, lat, major] of WATERS) {
        if (!major && eff < (this.mode === 'us' ? 3 : 1.8)) continue;
        const s = this._toScreen([lon, lat]); if (!s || s[0] < 0 || s[1] < 0 || s[0] > this.w || s[1] > this.h) continue;
        const fsz = major ? 12 : 10.5; // oceans and seas stay smaller than country names
        ctx.font = `italic 700 ${fsz}px Nunito, sans-serif`;
        if ('letterSpacing' in ctx) ctx.letterSpacing = major ? '2px' : '1px';
        const label = major ? name.toUpperCase() : name; const tw = ctx.measureText(label).width;
        if (tryLabel(s[0], s[1], tw, fsz)) text(label, s[0], s[1], `italic 700 ${fsz}px Nunito, sans-serif`, '#3b7fb3', 2.5);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      }
      // backdrop country names (gray, e.g. Canada and Mexico in USA Mode)
      if (this._backdropLabels) {
        for (const f of this._backdropLabels) {
          const sizePx = Math.sqrt(f.area) * scale; const name = f.properties.n;
          const fsz = Math.max(11, Math.min(16, sizePx / 9)); ctx.font = `italic 700 ${fsz}px Nunito, sans-serif`;
          const tw = ctx.measureText(name).width; if (sizePx < tw * 0.9) continue;
          const s = this._toScreen(f.lp); if (!s || s[0] < 0 || s[1] < 0 || s[0] > this.w || s[1] > this.h) continue;
          if (tryLabel(s[0], s[1], tw, fsz)) text(name, s[0], s[1], `italic 700 ${fsz}px Nunito, sans-serif`, '#8a8478', 3);
        }
      }
      // 1) country/state names  2) capitals  3) cities  4) mountains & deserts  5) river names
      drawPlaces(true);
      drawPlaces(false);
      if (this.detail && !light) {
        // mountains, deserts, plateaus
        if (eff >= 1.6) {
          for (const [name, lon, lat, t, rank] of this.detail.features) {
            if (rank > eff + 0.6) continue;
            const s = this._toScreen([lon, lat]); if (!s || s[0] < 0 || s[1] < 0 || s[0] > this.w || s[1] > this.h) continue;
            const label = t === 'm' ? '▲ ' + name : name;
            ctx.font = 'italic 700 10.5px Nunito, sans-serif';
            const tw = ctx.measureText(label).width;
            if (!tryLabel(s[0], s[1], tw, 12)) continue;
            text(label, s[0], s[1], 'italic 700 10.5px Nunito, sans-serif', t === 'm' ? COL.mountain : COL.desert);
          }
        }
        // river names
        if (eff >= 2.4) {
          let n = 0; const named = new Set();
          for (const r of this.detail.rivers.features) {
            if (!r.properties.n || r.properties.r > eff * 1.1 || /^Lake /.test(r.properties.n)) continue;
            const rname = /\b(River|Rio|Río|Canal|Creek)\b/i.test(r.properties.n) ? r.properties.n : r.properties.n + ' River';
            if (named.has(rname)) continue;
            const cs = r.geometry.type === 'LineString' ? r.geometry.coordinates : r.geometry.coordinates[0];
            if (!cs || cs.length < 2) continue;
            const mid = cs[(cs.length / 2) | 0]; const s = this._toScreen(mid);
            if (!s || s[0] < 0 || s[1] < 0 || s[0] > this.w || s[1] > this.h) continue;
            const nm = rname; ctx.font = 'italic 700 10px Nunito, sans-serif';
            const tw = ctx.measureText(nm).width; if (!tryLabel(s[0], s[1], tw, 12)) continue;
            named.add(rname);
            text(nm, s[0], s[1], 'italic 700 10px Nunito, sans-serif', '#2a6ea8');
            if (++n > 40) break;
          }
        }
      }
    }

    // which way is north on screen, in degrees clockwise from straight up (0 on the flat map)
    northAngle() {
      if (this.view === '2d') return 0;
      const c = [-this.rot[0], -this.rot[1]], p = this._proj();
      const a = p(c), b = p([c[0], Math.min(89.5, c[1] + 0.5)]);
      if (!a || !b) return 0;
      return Math.atan2(b[0] - a[0], a[1] - b[1]) * 180 / Math.PI;
    }

    _isTiny(f, scale) { return f.o && f.id === f.o && f.area * scale * scale < 5; }

    _drawHere(ctx) {
      if (!this.here) return;
      const s = this._toScreen(this.here); if (!s) return;
      const ph = (performance.now() % 2000) / 2000;
      ctx.beginPath(); ctx.arc(s[0], s[1], 10 + ph * 16, 0, 7); ctx.fillStyle = `rgba(10,132,255,${0.35 * (1 - ph)})`; ctx.fill();
      ctx.beginPath(); ctx.arc(s[0], s[1], 9, 0, 7); ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(s[0], s[1], 6.5, 0, 7); ctx.fillStyle = '#0a84ff'; ctx.fill();
      if (!this._hereAnim) { this._hereAnim = true; const loop = () => { if (!this.here) { this._hereAnim = false; return; } this.draw(); setTimeout(() => requestAnimationFrame(loop), 60); }; requestAnimationFrame(loop); }
    }

    _star(ctx, x, y, r, color) {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
    }
  }
  window.GameMap = GameMap;
})();
