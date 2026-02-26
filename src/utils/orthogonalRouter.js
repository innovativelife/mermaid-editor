// Grid-based A* orthogonal edge router with obstacle avoidance,
// crossing reduction, port distribution, and pinned-port support.

const CELL = 20
const NODE_PAD = 18
const TURN_COST = 4
const CROSS_COST = 16
const PORT_EXTEND = 28
const GRID_MARGIN = 160

// 0=right, 1=down, 2=left, 3=up
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]
const SIDE_TO_DIR = { right: 0, bottom: 1, left: 2, top: 3 }

// ── MinHeap ──────────────────────────────────────────────────

class MinHeap {
  constructor() { this.d = [] }
  get size() { return this.d.length }
  push(v) { this.d.push(v); this._up(this.d.length - 1) }
  pop() {
    const top = this.d[0]
    const last = this.d.pop()
    if (this.d.length > 0) { this.d[0] = last; this._down(0) }
    return top
  }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.d[p].f <= this.d[i].f) break
      ;[this.d[p], this.d[i]] = [this.d[i], this.d[p]]
      i = p
    }
  }
  _down(i) {
    const n = this.d.length
    while (true) {
      let s = i; const l = 2 * i + 1; const r = 2 * i + 2
      if (l < n && this.d[l].f < this.d[s].f) s = l
      if (r < n && this.d[r].f < this.d[s].f) s = r
      if (s === i) break
      ;[this.d[s], this.d[i]] = [this.d[i], this.d[s]]
      i = s
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────

function computeBBox(nodes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of nodes) {
    if (n.x < minX) minX = n.x
    if (n.y < minY) minY = n.y
    if (n.x + n.width > maxX) maxX = n.x + n.width
    if (n.y + n.height > maxY) maxY = n.y + n.height
  }
  return {
    minX: minX - GRID_MARGIN,
    minY: minY - GRID_MARGIN,
    maxX: maxX + GRID_MARGIN,
    maxY: maxY + GRID_MARGIN,
  }
}

// ── Port assignment ──────────────────────────────────────────

function autoSide(fromNode, toNode) {
  const dx = (toNode.x + toNode.width / 2) - (fromNode.x + fromNode.width / 2)
  const dy = (toNode.y + toNode.height / 2) - (fromNode.y + fromNode.height / 2)
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left'
  return dy >= 0 ? 'bottom' : 'top'
}

function portToWorld(node, side, offset) {
  switch (side) {
    case 'top':    return { x: node.x + node.width * offset, y: node.y }
    case 'right':  return { x: node.x + node.width, y: node.y + node.height * offset }
    case 'bottom': return { x: node.x + node.width * offset, y: node.y + node.height }
    case 'left':   return { x: node.x, y: node.y + node.height * offset }
  }
}

function computePortAssignments(nodes, edges) {
  // Group every edge-endpoint by (nodeId, side)
  const groups = {} // "nodeId:side" -> [ {edgeId, isFrom, otherNode, pinned, pinnedOffset} ]

  for (const edge of edges) {
    const fromNode = nodes.find(n => n.id === edge.from)
    const toNode = nodes.find(n => n.id === edge.to)
    if (!fromNode || !toNode) continue

    const fromSide = edge.fromPort ? edge.fromPort.side : autoSide(fromNode, toNode)
    const toSide   = edge.toPort   ? edge.toPort.side   : autoSide(toNode, fromNode)

    const fKey = `${edge.from}:${fromSide}`
    if (!groups[fKey]) groups[fKey] = []
    groups[fKey].push({
      edgeId: edge.id, isFrom: true, otherNode: toNode,
      pinned: !!edge.fromPort, pinnedOffset: edge.fromPort?.offset ?? 0.5,
      side: fromSide,
    })

    const tKey = `${edge.to}:${toSide}`
    if (!groups[tKey]) groups[tKey] = []
    groups[tKey].push({
      edgeId: edge.id, isFrom: false, otherNode: fromNode,
      pinned: !!edge.toPort, pinnedOffset: edge.toPort?.offset ?? 0.5,
      side: toSide,
    })
  }

  const assignments = {} // edgeId -> { from: {x,y,dir,side,offset}, to: {…} }

  for (const [key, eps] of Object.entries(groups)) {
    const [nodeId, side] = key.split(':')
    const node = nodes.find(n => n.id === nodeId)
    if (!node) continue

    const total = eps.length
    const pinned = eps.filter(e => e.pinned)
    const auto   = eps.filter(e => !e.pinned)

    // Sort auto endpoints by the other node's position to reduce crossings
    if (side === 'top' || side === 'bottom') {
      auto.sort((a, b) =>
        (a.otherNode.x + a.otherNode.width / 2) - (b.otherNode.x + b.otherNode.width / 2))
    } else {
      auto.sort((a, b) =>
        (a.otherNode.y + a.otherNode.height / 2) - (b.otherNode.y + b.otherNode.height / 2))
    }

    // Generate evenly-spaced slot positions
    const positions = []
    for (let i = 0; i < total; i++) {
      positions.push((i + 1) / (total + 1))
    }

    // Assign pinned endpoints to their nearest slot (but keep their exact offset)
    const usedIdxs = new Set()
    for (const ep of pinned) {
      let bestIdx = 0, bestDist = Infinity
      for (let i = 0; i < positions.length; i++) {
        if (usedIdxs.has(i)) continue
        const d = Math.abs(positions[i] - ep.pinnedOffset)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      usedIdxs.add(bestIdx)

      const offset = ep.pinnedOffset
      const pos = portToWorld(node, side, offset)
      const dir = SIDE_TO_DIR[side]
      const entry = { side, offset, dir, ...pos }

      if (!assignments[ep.edgeId]) assignments[ep.edgeId] = {}
      if (ep.isFrom) assignments[ep.edgeId].from = entry
      else assignments[ep.edgeId].to = entry
    }

    // Assign auto endpoints to remaining slots
    const availIdxs = []
    for (let i = 0; i < positions.length; i++) {
      if (!usedIdxs.has(i)) availIdxs.push(i)
    }

    for (let i = 0; i < auto.length; i++) {
      const ep = auto[i]
      const offset = i < availIdxs.length
        ? positions[availIdxs[i]]
        : (i + 1) / (auto.length + 1)
      const pos = portToWorld(node, side, offset)
      const dir = SIDE_TO_DIR[side]
      const entry = { side, offset, dir, ...pos }

      if (!assignments[ep.edgeId]) assignments[ep.edgeId] = {}
      if (ep.isFrom) assignments[ep.edgeId].from = entry
      else assignments[ep.edgeId].to = entry
    }
  }

  return assignments
}

// ── Grid ─────────────────────────────────────────────────────

function buildGrid(obstacles, bbox) {
  const ox = bbox.minX
  const oy = bbox.minY
  const gw = Math.ceil((bbox.maxX - bbox.minX) / CELL) + 1
  const gh = Math.ceil((bbox.maxY - bbox.minY) / CELL) + 1
  const grid = new Uint8Array(gw * gh)

  for (const n of obstacles) {
    const x0 = Math.floor((n.x - NODE_PAD - ox) / CELL)
    const y0 = Math.floor((n.y - NODE_PAD - oy) / CELL)
    const x1 = Math.ceil((n.x + n.width + NODE_PAD - ox) / CELL)
    const y1 = Math.ceil((n.y + n.height + NODE_PAD - oy) / CELL)
    for (let gy = Math.max(0, y0); gy <= Math.min(gh - 1, y1); gy++) {
      for (let gx = Math.max(0, x0); gx <= Math.min(gw - 1, x1); gx++) {
        grid[gy * gw + gx] = 1
      }
    }
  }

  return { grid, gw, gh, ox, oy }
}

// ── A* pathfinding ───────────────────────────────────────────

function astar(grid, usageGrid, gw, gh, sx, sy, sDir, ex, ey) {
  const stateKey = (x, y, d) => (x * gh + y) * 4 + d
  const manhattan = (x1, y1, x2, y2) => Math.abs(x2 - x1) + Math.abs(y2 - y1)

  const gScore = new Map()
  const cameFrom = new Map()
  const heap = new MinHeap()

  const k0 = stateKey(sx, sy, sDir)
  gScore.set(k0, 0)
  heap.push({ gx: sx, gy: sy, dir: sDir, g: 0, f: manhattan(sx, sy, ex, ey) })

  while (heap.size > 0) {
    const cur = heap.pop()
    const ck = stateKey(cur.gx, cur.gy, cur.dir)
    if (cur.g > (gScore.get(ck) ?? Infinity)) continue

    if (cur.gx === ex && cur.gy === ey) {
      const path = []
      let k = ck
      while (k !== undefined) {
        const d = k % 4
        const rem = (k - d) / 4
        const y = rem % gh
        const x = (rem - y) / gh
        path.push({ gx: x, gy: y })
        k = cameFrom.get(k)
      }
      path.reverse()
      return path
    }

    for (let d = 0; d < 4; d++) {
      const nx = cur.gx + DX[d]
      const ny = cur.gy + DY[d]
      if (nx < 0 || nx >= gw || ny < 0 || ny >= gh) continue
      if (grid[ny * gw + nx]) continue

      const turn = (d !== cur.dir) ? TURN_COST : 0
      const cross = usageGrid[ny * gw + nx] ? CROSS_COST : 0
      const ng = cur.g + 1 + turn + cross
      const nk = stateKey(nx, ny, d)

      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng)
        cameFrom.set(nk, ck)
        heap.push({ gx: nx, gy: ny, dir: d, g: ng, f: ng + manhattan(nx, ny, ex, ey) })
      }
    }
  }

  return null
}

// ── Path helpers ─────────────────────────────────────────────

function simplifyGridPath(gridPath, ox, oy) {
  if (!gridPath || gridPath.length === 0) return null
  const pts = gridPath.map(p => ({ x: ox + p.gx * CELL, y: oy + p.gy * CELL }))
  if (pts.length <= 2) return pts
  const result = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = result[result.length - 1]
    const cur = pts[i]
    const next = pts[i + 1]
    if (!(prev.x === cur.x && cur.x === next.x) &&
        !(prev.y === cur.y && cur.y === next.y)) {
      result.push(cur)
    }
  }
  result.push(pts[pts.length - 1])
  return result
}

function fallbackRoute(fp, tp, obstacles) {
  // Simple L/Z-shaped route when A* fails.
  // Build minimal clean orthogonal path from port to port.
  const isHorizF = fp.dir === 0 || fp.dir === 2
  const isHorizT = tp.dir === 0 || tp.dir === 2

  const extF = { x: fp.x + DX[fp.dir] * PORT_EXTEND, y: fp.y + DY[fp.dir] * PORT_EXTEND }
  const extT = { x: tp.x + DX[tp.dir] * PORT_EXTEND, y: tp.y + DY[tp.dir] * PORT_EXTEND }

  const pts = [{ x: fp.x, y: fp.y }, extF]

  if (isHorizF && isHorizT) {
    // Both horizontal: Z-shape via shared X midpoint
    const midX = (extF.x + extT.x) / 2
    pts.push({ x: midX, y: extF.y })
    pts.push({ x: midX, y: extT.y })
  } else if (!isHorizF && !isHorizT) {
    // Both vertical: Z-shape via shared Y midpoint
    const midY = (extF.y + extT.y) / 2
    pts.push({ x: extF.x, y: midY })
    pts.push({ x: extT.x, y: midY })
  } else if (isHorizF) {
    // F exits horizontal, T exits vertical: L-shape
    pts.push({ x: extT.x, y: extF.y })
  } else {
    // F exits vertical, T exits horizontal: L-shape
    pts.push({ x: extF.x, y: extT.y })
  }

  pts.push(extT)
  pts.push({ x: tp.x, y: tp.y })
  const cleaned = enforceOrthogonal(dedup(pts))
  const rerouted = obstacles ? rerouteAroundObstacles(cleaned, obstacles) : cleaned
  return ensurePerpendicularEntry(rerouted, fp, tp)
}

function dedup(pts) {
  if (pts.length <= 1) return pts
  const r = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = r[r.length - 1]
    if (pts[i].x !== prev.x || pts[i].y !== prev.y) r.push(pts[i])
  }
  if (r.length <= 2) return r
  const out = [r[0]]
  for (let i = 1; i < r.length - 1; i++) {
    const prev = out[out.length - 1]
    const cur = r[i]
    const next = r[i + 1]
    if (!(prev.x === cur.x && cur.x === next.x) &&
        !(prev.y === cur.y && cur.y === next.y)) {
      out.push(cur)
    }
  }
  out.push(r[r.length - 1])
  return out
}

// ── Smooth out tiny kinks left by grid snapping ──────────────

function smoothKinks(pts) {
  // A "kink" is a very short segment (< CELL) caused by misalignment
  // between exact port positions and the grid-snapped A* path.
  // We collapse them by extending the adjacent longer segment.
  const MIN_SEG = CELL * 1.2
  if (pts.length < 4) return pts

  let result = [...pts]

  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    const out = [result[0]]

    // Process all interior points (including checking the segment up to the final point)
    for (let i = 1; i < result.length; i++) {
      const prev = out[out.length - 1]
      const cur = result[i]

      // Measure the segment prev→cur
      const dx = Math.abs(cur.x - prev.x)
      const dy = Math.abs(cur.y - prev.y)
      const segLen = dx + dy

      if (segLen > 0 && segLen < MIN_SEG && out.length >= 2) {
        const pp = out[out.length - 2]

        if (dx === 0 && dy < MIN_SEG) {
          // Short vertical segment. prev.x === cur.x.
          if (pp.y === prev.y) {
            // pp→prev is horizontal. Absorb by moving prev's Y to cur's Y.
            out[out.length - 1] = { x: prev.x, y: cur.y }
            changed = true
            continue
          }
          if (pp.x === prev.x) {
            // pp→prev is also vertical. Just skip cur (extend the vertical).
            changed = true
            continue
          }
        } else if (dy === 0 && dx < MIN_SEG) {
          // Short horizontal segment. prev.y === cur.y.
          if (pp.x === prev.x) {
            // pp→prev is vertical. Absorb by moving prev's X to cur's X.
            out[out.length - 1] = { x: cur.x, y: prev.y }
            changed = true
            continue
          }
          if (pp.y === prev.y) {
            // pp→prev is also horizontal. Just skip cur.
            changed = true
            continue
          }
        }
      }

      out.push(cur)
    }

    result = dedup(out)
    if (!changed) break
  }

  return result
}

// ── Enforce strict orthogonality ─────────────────────────────
// Guarantee every segment is purely horizontal or vertical.
// If any consecutive pair of points forms a diagonal, insert
// an elbow (bend point) to split it into two orthogonal segments.

function enforceOrthogonal(pts) {
  if (!pts || pts.length < 2) return pts
  const out = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    const cur = pts[i]
    if (prev.x !== cur.x && prev.y !== cur.y) {
      // Diagonal — insert an elbow.
      // Heuristic: continue the direction of the segment before prev
      // to keep the path feeling consistent. Fall back to horizontal-first.
      let horizFirst = true
      if (out.length >= 2) {
        const pp = out[out.length - 2]
        if (pp.x === prev.x) {
          // Previous segment was vertical → continue vertical, then horizontal
          horizFirst = false
        }
      }
      if (horizFirst) {
        out.push({ x: cur.x, y: prev.y })
      } else {
        out.push({ x: prev.x, y: cur.y })
      }
    }
    out.push(cur)
  }
  return dedup(out)
}

// ── Reroute segments that cross through obstacle nodes ────────
// After stitching / alignment / kink smoothing, some segments may
// pass through obstacle rectangles.  For each such segment we
// replace it with a 3-segment detour around the obstacle.

function segmentIntersectsRect(ax, ay, bx, by, n, pad) {
  // Does the axis-aligned segment (ax,ay)→(bx,by) cross through the
  // padded rectangle of node n?
  const left   = n.x - pad
  const right  = n.x + n.width + pad
  const top    = n.y - pad
  const bottom = n.y + n.height + pad

  if (ax === bx) {
    // Vertical segment
    if (ax <= left || ax >= right) return false
    const minY = Math.min(ay, by)
    const maxY = Math.max(ay, by)
    if (maxY <= top || minY >= bottom) return false
    return true
  }
  if (ay === by) {
    // Horizontal segment
    if (ay <= top || ay >= bottom) return false
    const minX = Math.min(ax, bx)
    const maxX = Math.max(ax, bx)
    if (maxX <= left || minX >= right) return false
    return true
  }
  return false
}

function rerouteAroundObstacles(pts, obstacles) {
  if (!pts || pts.length < 2 || obstacles.length === 0) return pts
  const PAD = 4  // small extra margin when detouring

  let result = pts
  // Multiple passes since a detour may itself need fixing
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    const out = [result[0]]

    for (let i = 1; i < result.length; i++) {
      const a = out[out.length - 1]
      const b = result[i]

      // Find the first obstacle this segment crosses
      let hitNode = null
      for (const n of obstacles) {
        if (segmentIntersectsRect(a.x, a.y, b.x, b.y, n, PAD)) {
          hitNode = n
          break
        }
      }

      if (hitNode) {
        changed = true
        const left   = hitNode.x - NODE_PAD - PAD
        const right  = hitNode.x + hitNode.width + NODE_PAD + PAD
        const top    = hitNode.y - NODE_PAD - PAD
        const bottom = hitNode.y + hitNode.height + NODE_PAD + PAD

        if (a.x === b.x) {
          // Vertical segment crossing the node — detour left or right
          const goingDown = b.y > a.y
          // Pick whichever side is closer to the segment's X
          const distLeft  = Math.abs(a.x - left)
          const distRight = Math.abs(a.x - right)
          const detourX = distLeft <= distRight ? left : right

          const entryY = goingDown ? top : bottom
          const exitY  = goingDown ? bottom : top

          out.push({ x: a.x, y: entryY })
          out.push({ x: detourX, y: entryY })
          out.push({ x: detourX, y: exitY })
          out.push({ x: a.x, y: exitY })
        } else {
          // Horizontal segment crossing the node — detour above or below
          const goingRight = b.x > a.x
          const distTop    = Math.abs(a.y - top)
          const distBottom = Math.abs(a.y - bottom)
          const detourY = distTop <= distBottom ? top : bottom

          const entryX = goingRight ? left : right
          const exitX  = goingRight ? right : left

          out.push({ x: entryX, y: a.y })
          out.push({ x: entryX, y: detourY })
          out.push({ x: exitX, y: detourY })
          out.push({ x: exitX, y: a.y })
        }
      }

      out.push(b)
    }

    result = dedup(out)
    if (!changed) break
  }

  return result
}

// ── Enforce perpendicular entry / exit at ports ──────────────
// The segment touching each port must be perpendicular to the
// node surface.  e.g. a port on the "left" side (dir=2) means
// the connector must arrive horizontally from the left.
// If the last/first segment runs parallel to the surface instead,
// we insert a stub elbow so the connector enters head-on.

function ensurePerpendicularEntry(pts, fromPort, toPort) {
  if (!pts || pts.length < 2) return pts

  // Port dir 0=right,2=left → horizontal; 1=down,3=up → vertical
  const isHorizFrom = fromPort.dir === 0 || fromPort.dir === 2
  const isHorizTo   = toPort.dir === 0   || toPort.dir === 2

  // Build the new path
  const out = []

  // --- Emit start with correct exit direction ---
  const portF = pts[0]
  const nextF = pts[1]
  out.push(portF)

  if (isHorizFrom && portF.y !== nextF.y) {
    // Port exits horizontally but next point is not on same Y.
    // Insert: go out horizontally, then turn.
    const sx = portF.x + DX[fromPort.dir] * PORT_EXTEND
    out.push({ x: sx, y: portF.y })
    out.push({ x: sx, y: nextF.y })
  } else if (!isHorizFrom && portF.x !== nextF.x) {
    // Port exits vertically but next point is not on same X.
    const sy = portF.y + DY[fromPort.dir] * PORT_EXTEND
    out.push({ x: portF.x, y: sy })
    out.push({ x: nextF.x, y: sy })
  }

  // --- Copy middle points ---
  for (let i = 1; i < pts.length - 1; i++) {
    out.push(pts[i])
  }

  // --- Emit end with correct entry direction ---
  const portT = pts[pts.length - 1]
  const prevT = pts[pts.length - 2]

  if (isHorizTo && prevT.y !== portT.y) {
    // Port enters horizontally but previous point is not on same Y.
    const sx = portT.x + DX[toPort.dir] * PORT_EXTEND
    out.push({ x: sx, y: prevT.y })
    out.push({ x: sx, y: portT.y })
  } else if (!isHorizTo && prevT.x !== portT.x) {
    // Port enters vertically but previous point is not on same X.
    const sy = portT.y + DY[toPort.dir] * PORT_EXTEND
    out.push({ x: prevT.x, y: sy })
    out.push({ x: portT.x, y: sy })
  }

  out.push(portT)

  return dedup(out)
}

// ── Route one edge using pre-assigned ports ──────────────────

function routeEdgeWithPorts(fromPort, toPort, obstacles, bbox, usageGrid) {
  const { grid, gw, gh, ox, oy } = buildGrid(obstacles, bbox)

  const extFx = fromPort.x + DX[fromPort.dir] * PORT_EXTEND
  const extFy = fromPort.y + DY[fromPort.dir] * PORT_EXTEND
  const extTx = toPort.x + DX[toPort.dir] * PORT_EXTEND
  const extTy = toPort.y + DY[toPort.dir] * PORT_EXTEND

  const csgx = Math.max(0, Math.min(gw - 1, Math.round((extFx - ox) / CELL)))
  const csgy = Math.max(0, Math.min(gh - 1, Math.round((extFy - oy) / CELL)))
  const cegx = Math.max(0, Math.min(gw - 1, Math.round((extTx - ox) / CELL)))
  const cegy = Math.max(0, Math.min(gh - 1, Math.round((extTy - oy) / CELL)))

  grid[csgy * gw + csgx] = 0
  grid[cegy * gw + cegx] = 0

  const gridPath = astar(grid, usageGrid, gw, gh, csgx, csgy, fromPort.dir, cegx, cegy)

  if (!gridPath) return fallbackRoute(fromPort, toPort, obstacles)

  const simplified = simplifyGridPath(gridPath, ox, oy)
  if (!simplified || simplified.length === 0) return fallbackRoute(fromPort, toPort, obstacles)

  // ── Align grid endpoints to exact port coords when safe ────
  // When the first/last A* segment is perpendicular to the port exit,
  // we can shift the endpoint to match the port coordinate exactly,
  // which prevents tiny kinks at the junction.
  const isHorizFrom = fromPort.dir === 0 || fromPort.dir === 2
  const isHorizTo   = toPort.dir === 0   || toPort.dir === 2

  if (simplified.length >= 2) {
    // --- Fix start endpoint ---
    if (isHorizFrom && simplified[0].x === simplified[1].x) {
      // First segment is vertical (perpendicular to horiz exit) → shift Y
      simplified[0] = { x: simplified[0].x, y: fromPort.y }
    } else if (!isHorizFrom && simplified[0].y === simplified[1].y) {
      // First segment is horizontal (perpendicular to vert exit) → shift X
      simplified[0] = { x: fromPort.x, y: simplified[0].y }
    } else if (isHorizFrom && simplified[0].y === simplified[1].y) {
      // First segment is horizontal (parallel to horiz exit) → shift both Y to port's Y
      simplified[0] = { x: simplified[0].x, y: fromPort.y }
      simplified[1] = { x: simplified[1].x, y: fromPort.y }
    } else if (!isHorizFrom && simplified[0].x === simplified[1].x) {
      // First segment is vertical (parallel to vert exit) → shift both X to port's X
      simplified[0] = { x: fromPort.x, y: simplified[0].y }
      simplified[1] = { x: fromPort.x, y: simplified[1].y }
    }

    // --- Fix end endpoint ---
    const li = simplified.length - 1
    if (isHorizTo && simplified[li].x === simplified[li - 1].x) {
      // Last segment is vertical (perpendicular to horiz entry) → shift Y
      simplified[li] = { x: simplified[li].x, y: toPort.y }
    } else if (!isHorizTo && simplified[li].y === simplified[li - 1].y) {
      // Last segment is horizontal (perpendicular to vert entry) → shift X
      simplified[li] = { x: toPort.x, y: simplified[li].y }
    } else if (isHorizTo && simplified[li].y === simplified[li - 1].y) {
      // Last segment is horizontal (parallel to horiz entry) → shift both Y to port's Y
      simplified[li]     = { x: simplified[li].x,     y: toPort.y }
      simplified[li - 1] = { x: simplified[li - 1].x, y: toPort.y }
    } else if (!isHorizTo && simplified[li].x === simplified[li - 1].x) {
      // Last segment is vertical (parallel to vert entry) → shift both X to port's X
      simplified[li]     = { x: toPort.x, y: simplified[li].y }
      simplified[li - 1] = { x: toPort.x, y: simplified[li - 1].y }
    }
  } else if (simplified.length === 1) {
    // Single-point grid path — just use the midpoint between extensions
    if (isHorizFrom) {
      simplified[0] = { x: simplified[0].x, y: fromPort.y }
    } else {
      simplified[0] = { x: fromPort.x, y: simplified[0].y }
    }
  }

  // ── Stitch: port → (optional alignment) → grid path → (optional alignment) → port
  const result = [{ x: fromPort.x, y: fromPort.y }]

  const first = simplified[0]
  if (isHorizFrom) {
    if (first.y !== fromPort.y) result.push({ x: first.x, y: fromPort.y })
  } else {
    if (first.x !== fromPort.x) result.push({ x: fromPort.x, y: first.y })
  }

  for (const p of simplified) result.push(p)

  const last = simplified[simplified.length - 1]
  if (isHorizTo) {
    if (last.y !== toPort.y) result.push({ x: last.x, y: toPort.y })
  } else {
    if (last.x !== toPort.x) result.push({ x: toPort.x, y: last.y })
  }

  result.push({ x: toPort.x, y: toPort.y })

  const cleaned = enforceOrthogonal(smoothKinks(dedup(result)))
  const rerouted = rerouteAroundObstacles(cleaned, obstacles)
  return ensurePerpendicularEntry(rerouted, fromPort, toPort)
}

// ── Main entry point ─────────────────────────────────────────

export function routeAllEdges(nodes, edges, isDragging = false) {
  if (nodes.length === 0 || edges.length === 0) return {}

  const assignments = computePortAssignments(nodes, edges)
  const bbox = computeBBox(nodes)
  const gw = Math.ceil((bbox.maxX - bbox.minX) / CELL) + 1
  const gh = Math.ceil((bbox.maxY - bbox.minY) / CELL) + 1
  // During drag, skip crossing avoidance for performance — use empty usage grid.
  // Full crossing avoidance recomputes when drag ends.
  const usageGrid = new Uint8Array(gw * gh)

  // Sort shorter edges first for better routing
  const sorted = [...edges].map(e => {
    const a = assignments[e.id]
    if (!a || !a.from || !a.to) return { edge: e, dist: 0 }
    return {
      edge: e,
      dist: Math.abs(a.from.x - a.to.x) + Math.abs(a.from.y - a.to.y),
    }
  }).sort((a, b) => a.dist - b.dist)

  const routes = {}
  const ox = bbox.minX
  const oy = bbox.minY

  for (const { edge } of sorted) {
    const a = assignments[edge.id]
    if (!a || !a.from || !a.to) continue

    const fromNode = nodes.find(n => n.id === edge.from)
    const toNode = nodes.find(n => n.id === edge.to)
    if (!fromNode || !toNode) continue

    const obstacles = nodes.filter(n => n.id !== edge.from && n.id !== edge.to)
    const path = routeEdgeWithPorts(a.from, a.to, obstacles, bbox, usageGrid)
    routes[edge.id] = path

    // Only mark usage grid when not dragging — during drag we skip
    // crossing avoidance for performance; full recompute on drag end.
    if (path && !isDragging) {
      // Mark all grid cells along every segment of the path,
      // not just the corner points, so crossing detection works.
      for (let i = 0; i < path.length - 1; i++) {
        const ax = Math.round((path[i].x - ox) / CELL)
        const ay = Math.round((path[i].y - oy) / CELL)
        const bx = Math.round((path[i + 1].x - ox) / CELL)
        const by = Math.round((path[i + 1].y - oy) / CELL)
        if (ax === bx) {
          // Vertical segment
          const minY = Math.min(ay, by), maxY = Math.max(ay, by)
          for (let y = minY; y <= maxY; y++) {
            if (ax >= 0 && ax < gw && y >= 0 && y < gh) {
              usageGrid[y * gw + ax] = 1
            }
          }
        } else {
          // Horizontal segment
          const minX = Math.min(ax, bx), maxX = Math.max(ax, bx)
          for (let x = minX; x <= maxX; x++) {
            if (x >= 0 && x < gw && ay >= 0 && ay < gh) {
              usageGrid[ay * gw + x] = 1
            }
          }
        }
      }
    }
  }

  return routes
}

// ── Snap mouse position to nearest node perimeter point ──────

export function nearestPerimeterPoint(node, px, py) {
  const candidates = []

  // Top
  const tx = Math.max(node.x, Math.min(node.x + node.width, px))
  candidates.push({
    side: 'top', x: tx, y: node.y,
    offset: node.width > 0 ? (tx - node.x) / node.width : 0.5,
  })
  // Right
  const ry = Math.max(node.y, Math.min(node.y + node.height, py))
  candidates.push({
    side: 'right', x: node.x + node.width, y: ry,
    offset: node.height > 0 ? (ry - node.y) / node.height : 0.5,
  })
  // Bottom
  const bx = Math.max(node.x, Math.min(node.x + node.width, px))
  candidates.push({
    side: 'bottom', x: bx, y: node.y + node.height,
    offset: node.width > 0 ? (bx - node.x) / node.width : 0.5,
  })
  // Left
  const ly = Math.max(node.y, Math.min(node.y + node.height, py))
  candidates.push({
    side: 'left', x: node.x, y: ly,
    offset: node.height > 0 ? (ly - node.y) / node.height : 0.5,
  })

  let best = null, bestDist = Infinity
  for (const c of candidates) {
    const d = (px - c.x) ** 2 + (py - c.y) ** 2
    if (d < bestDist) { bestDist = d; best = c }
  }

  // Clamp offset away from corners
  best.offset = Math.max(0.1, Math.min(0.9, best.offset))
  return best
}

// ── Rendering utilities ──────────────────────────────────────

export function getPolylineMidpoint(points) {
  if (!points || points.length < 2) return { x: 0, y: 0 }
  let totalLen = 0
  const segs = []
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    segs.push(Math.sqrt(dx * dx + dy * dy))
    totalLen += segs[i]
  }
  let half = totalLen / 2
  for (let i = 0; i < segs.length; i++) {
    if (half <= segs[i] && segs[i] > 0) {
      const t = half / segs[i]
      return {
        x: points[i].x + t * (points[i + 1].x - points[i].x),
        y: points[i].y + t * (points[i + 1].y - points[i].y),
      }
    }
    half -= segs[i]
  }
  return points[points.length - 1]
}

export function distToPolyline(px, py, points) {
  let minDist = Infinity
  for (let i = 0; i < points.length - 1; i++) {
    const ax = points[i].x, ay = points[i].y
    const bx = points[i + 1].x, by = points[i + 1].y
    const dx = bx - ax, dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx, cy = ay + t * dy
    const d = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2)
    if (d < minDist) minDist = d
  }
  return minDist
}
