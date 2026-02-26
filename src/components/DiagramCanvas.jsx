import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import {
  routeAllEdges, distToPolyline, getPolylineMidpoint, nearestPerimeterPoint,
} from '../utils/orthogonalRouter'

function getPortPositions(node) {
  const cx = node.x + node.width / 2
  const cy = node.y + node.height / 2
  return [
    { key: 'top', x: cx, y: node.y },
    { key: 'right', x: node.x + node.width, y: cy },
    { key: 'bottom', x: cx, y: node.y + node.height },
    { key: 'left', x: node.x, y: cy },
  ]
}

// ── Text wrapping helper ─────────────────────────────────────
// Splits label into lines that fit within the given width.
// Uses a simple word-wrap algorithm with approximate char width.
const CHAR_WIDTH = 7.5   // approx px per char at 13px font
const LINE_HEIGHT = 18   // px between lines
const TEXT_PAD = 16       // horizontal padding inside node

function wrapText(label, maxWidth) {
  const charPerLine = Math.max(4, Math.floor((maxWidth - TEXT_PAD * 2) / CHAR_WIDTH))
  const words = label.split(/\s+/)
  const lines = []
  let cur = ''
  for (const w of words) {
    if (cur.length === 0) {
      cur = w
    } else if (cur.length + 1 + w.length <= charPerLine) {
      cur += ' ' + w
    } else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  // If a single word is longer than charPerLine, keep it on one line
  return lines.length > 0 ? lines : [label]
}

function getTextHeight(lines) {
  return lines.length * LINE_HEIGHT
}

function getTextWidth(lines) {
  let max = 0
  for (const l of lines) max = Math.max(max, l.length * CHAR_WIDTH)
  return max + TEXT_PAD * 2
}

export default function DiagramCanvas({
  nodes, edges, selectedNode, selectedEdge, connectingFrom,
  onSelectNode, onSelectEdge, onDeselectAll, onAddNode, onUpdateNode,
  onUpdateEdge, onStartConnect, onCompleteConnect,
}) {
  const svgRef = useRef(null)
  const [dragging, setDragging] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState(null)
  const [hoveredNode, setHoveredNode] = useState(null)
  const [dragConnecting, setDragConnecting] = useState(false)

  // Endpoint dragging state: { edgeId, which: 'from'|'to' }
  const [draggingEndpoint, setDraggingEndpoint] = useState(null)
  const [endpointPreview, setEndpointPreview] = useState(null) // { x, y, side, offset }

  // During node drag, use lightweight routing (no crossing avoidance).
  // When drag ends (dragging === null), recompute with full crossing avoidance.
  const isDragging = dragging !== null
  const routes = useMemo(
    () => routeAllEdges(nodes, edges, isDragging),
    [nodes, edges, isDragging]
  )

  // Auto-resize nodes when text doesn't fit
  useEffect(() => {
    for (const node of nodes) {
      const lines = wrapText(node.label, node.width)
      const neededH = getTextHeight(lines) + TEXT_PAD * 2
      const neededW = getTextWidth(lines)
      const minW = node.sizePreset === 'custom' ? node.width : neededW
      const minH = node.sizePreset === 'custom' ? node.height : neededH
      if (minW > node.width || minH > node.height) {
        onUpdateNode(node.id, {
          width: Math.max(node.width, minW),
          height: Math.max(node.height, minH),
        })
      }
    }
  }, [nodes, onUpdateNode])

  const getSVGPoint = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: e.clientX - rect.left - panOffset.x,
      y: e.clientY - rect.top - panOffset.y,
    }
  }, [panOffset])

  const isConnecting = connectingFrom != null

  const handleCanvasMouseDown = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('canvas-bg')) {
      if (e.button === 1 || e.altKey) {
        setIsPanning(true)
        setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y })
        return
      }

      const pt = getSVGPoint(e)

      for (const edge of edges) {
        const pts = routes[edge.id]
        if (!pts || pts.length < 2) continue
        const dist = distToPolyline(pt.x, pt.y, pts)
        if (dist < 10) {
          onSelectEdge(edge.id)
          return
        }
      }

      if (isConnecting) {
        onDeselectAll()
        setDragConnecting(false)
        return
      }
      onDeselectAll()
    }
  }, [edges, routes, isConnecting, getSVGPoint, onSelectEdge, onDeselectAll, panOffset])

  const handleCanvasDoubleClick = useCallback((e) => {
    if (e.target === svgRef.current || e.target.classList.contains('canvas-bg')) {
      const pt = getSVGPoint(e)
      onAddNode(pt.x - 70, pt.y - 25)
    }
  }, [getSVGPoint, onAddNode])

  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation()
    if (isConnecting) {
      if (connectingFrom !== nodeId) onCompleteConnect(nodeId)
      setDragConnecting(false)
      return
    }
    onSelectNode(nodeId)
    const node = nodes.find(n => n.id === nodeId)
    const pt = getSVGPoint(e)
    setDragOffset({ x: pt.x - node.x, y: pt.y - node.y })
    setDragging(nodeId)
  }, [isConnecting, connectingFrom, nodes, getSVGPoint, onSelectNode, onCompleteConnect])

  const handlePortMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation()
    onStartConnect(nodeId)
    setDragConnecting(true)
    const rect = svgRef.current.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left - panOffset.x,
      y: e.clientY - rect.top - panOffset.y,
    })
  }, [onStartConnect, panOffset])

  // ── Endpoint handle drag ─────────────────────────────────

  const handleEndpointMouseDown = useCallback((e, edgeId, which) => {
    e.stopPropagation()
    setDraggingEndpoint({ edgeId, which })
    setEndpointPreview(null)
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
      return
    }

    // Endpoint handle drag: snap to nearest perimeter point
    if (draggingEndpoint) {
      const pt = getSVGPoint(e)
      const edge = edges.find(ed => ed.id === draggingEndpoint.edgeId)
      if (edge) {
        const nodeId = draggingEndpoint.which === 'from' ? edge.from : edge.to
        const node = nodes.find(n => n.id === nodeId)
        if (node) {
          const snap = nearestPerimeterPoint(node, pt.x, pt.y)
          setEndpointPreview(snap)
        }
      }
      return
    }

    if (dragging) {
      const pt = getSVGPoint(e)
      onUpdateNode(dragging, {
        x: pt.x - dragOffset.x,
        y: pt.y - dragOffset.y,
      })
    }
    if (isConnecting) {
      const rect = svgRef.current.getBoundingClientRect()
      setMousePos({
        x: e.clientX - rect.left - panOffset.x,
        y: e.clientY - rect.top - panOffset.y,
      })
    }
  }, [dragging, dragOffset, getSVGPoint, onUpdateNode, isPanning, panStart,
      isConnecting, panOffset, draggingEndpoint, edges, nodes])

  const handleMouseUp = useCallback((e) => {
    // Commit endpoint drag
    if (draggingEndpoint && endpointPreview) {
      const { edgeId, which } = draggingEndpoint
      const portData = { side: endpointPreview.side, offset: endpointPreview.offset }
      if (which === 'from') {
        onUpdateEdge(edgeId, { fromPort: portData })
      } else {
        onUpdateEdge(edgeId, { toPort: portData })
      }
      setDraggingEndpoint(null)
      setEndpointPreview(null)
      return
    }
    if (draggingEndpoint) {
      setDraggingEndpoint(null)
      setEndpointPreview(null)
      return
    }

    if (dragConnecting && isConnecting) {
      const pt = getSVGPoint(e)
      const target = nodes.find(n =>
        pt.x >= n.x && pt.x <= n.x + n.width &&
        pt.y >= n.y && pt.y <= n.y + n.height
      )
      if (target && target.id !== connectingFrom) {
        onCompleteConnect(target.id)
      } else {
        onDeselectAll()
      }
      setDragConnecting(false)
    }
    setDragging(null)
    setIsPanning(false)
  }, [draggingEndpoint, endpointPreview, onUpdateEdge, dragConnecting, isConnecting,
      connectingFrom, nodes, getSVGPoint, onCompleteConnect, onDeselectAll])

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseUp])

  const fromNode = connectingFrom ? nodes.find(n => n.id === connectingFrom) : null

  // Determine selected edge's endpoint positions for handles
  const selectedEdgeData = selectedEdge ? edges.find(e => e.id === selectedEdge) : null
  const selectedRoute = selectedEdge ? routes[selectedEdge] : null

  return (
    <div className="canvas-container">
      <div className="canvas-hint">
        Double-click to add a node. Drag from a port to connect. Drag edge endpoints to reposition.
      </div>
      <svg
        ref={svgRef}
        className="diagram-canvas"
        onMouseDown={handleCanvasMouseDown}
        onDoubleClick={handleCanvasDoubleClick}
        onMouseMove={handleMouseMove}
      >
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
          </marker>
          <marker id="arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#60a5fa" />
          </marker>
          <marker id="arrowhead-connecting" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
          </marker>
        </defs>
        <g transform={`translate(${panOffset.x}, ${panOffset.y})`}>
          <rect
            className="canvas-bg"
            x="-5000" y="-5000" width="10000" height="10000"
            fill="transparent"
          />

          {/* Edges — orthogonal polylines */}
          {edges.map(edge => {
            const pts = routes[edge.id]
            if (!pts || pts.length < 2) return null
            const isSelected = selectedEdge === edge.id
            const pointStr = pts.map(p => `${p.x},${p.y}`).join(' ')
            const mid = getPolylineMidpoint(pts)

            return (
              <g key={edge.id}>
                <polyline
                  points={pointStr}
                  fill="none" stroke="transparent" strokeWidth="16"
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => { e.stopPropagation(); onSelectEdge(edge.id) }}
                />
                <polyline
                  points={pointStr}
                  fill="none"
                  stroke={isSelected ? '#60a5fa' : '#94a3b8'}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  strokeLinejoin="round"
                  markerEnd={isSelected ? 'url(#arrowhead-selected)' : 'url(#arrowhead)'}
                  style={{ pointerEvents: 'none' }}
                />
                {edge.label && (
                  <>
                    <rect
                      x={mid.x - edge.label.length * 3.5 - 4} y={mid.y - 10}
                      width={edge.label.length * 7 + 8} height={20}
                      rx="3" className="edge-label-bg"
                    />
                    <text
                      x={mid.x} y={mid.y}
                      textAnchor="middle" dominantBaseline="central"
                      className="edge-label"
                      fill={isSelected ? '#60a5fa' : '#cbd5e1'}
                    >
                      {edge.label}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          {/* Endpoint handles on selected edge */}
          {selectedEdgeData && selectedRoute && selectedRoute.length >= 2 && (
            <>
              {/* From-handle */}
              <EndpointHandle
                x={selectedRoute[0].x}
                y={selectedRoute[0].y}
                pinned={!!selectedEdgeData.fromPort}
                onMouseDown={(e) => handleEndpointMouseDown(e, selectedEdge, 'from')}
              />
              {/* To-handle */}
              <EndpointHandle
                x={selectedRoute[selectedRoute.length - 1].x}
                y={selectedRoute[selectedRoute.length - 1].y}
                pinned={!!selectedEdgeData.toPort}
                onMouseDown={(e) => handleEndpointMouseDown(e, selectedEdge, 'to')}
              />
            </>
          )}

          {/* Endpoint drag preview */}
          {draggingEndpoint && endpointPreview && (
            <circle
              cx={endpointPreview.x} cy={endpointPreview.y} r="7"
              className="endpoint-preview"
            />
          )}

          {/* Drag-connection line */}
          {isConnecting && fromNode && mousePos && (
            <line
              x1={fromNode.x + fromNode.width / 2}
              y1={fromNode.y + fromNode.height / 2}
              x2={mousePos.x} y2={mousePos.y}
              stroke="#f59e0b" strokeWidth="2" strokeDasharray="6 3"
              markerEnd="url(#arrowhead-connecting)"
              style={{ pointerEvents: 'none' }}
            />
          )}

          {/* Nodes */}
          {nodes.map(node => {
            const isSelected = selectedNode === node.id
            const isConnectSource = connectingFrom === node.id
            const isHovered = hoveredNode === node.id
            const showPorts = (isHovered || isSelected) && !isConnecting
            const bw = node.borderWidth === 'thin' ? 1 : node.borderWidth === 'thick' ? 3 : 1.5
            const nodeStyle = {
              ...(node.fillColor ? { fill: node.fillColor } : {}),
              ...(node.borderColor ? { stroke: node.borderColor } : {}),
              strokeWidth: isSelected ? bw + 1 : bw,
            }
            const outlineStyle = {
              ...(node.borderColor ? { stroke: node.borderColor } : {}),
              strokeWidth: isSelected ? bw + 1 : bw,
            }
            const cls = `node-shape ${isSelected ? 'selected' : ''} ${isConnectSource ? 'connecting' : ''}`
            const outCls = `node-outline ${isSelected ? 'selected' : ''}`

            return (
              <g
                key={node.id}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{ cursor: isConnecting ? 'crosshair' : 'grab' }}
              >
                {node.shape === 'diamond' ? (
                  <polygon
                    points={`
                      ${node.x + node.width / 2},${node.y}
                      ${node.x + node.width},${node.y + node.height / 2}
                      ${node.x + node.width / 2},${node.y + node.height}
                      ${node.x},${node.y + node.height / 2}
                    `}
                    className={cls} style={nodeStyle}
                  />
                ) : node.shape === 'circle' ? (
                  <ellipse
                    cx={node.x + node.width / 2} cy={node.y + node.height / 2}
                    rx={node.width / 2} ry={node.height / 2}
                    className={cls} style={nodeStyle}
                  />
                ) : node.shape === 'round' ? (
                  <rect
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rx="12" ry="12"
                    className={cls} style={nodeStyle}
                  />
                ) : node.shape === 'stadium' ? (
                  <rect
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rx="25" ry="25"
                    className={cls} style={nodeStyle}
                  />
                ) : node.shape === 'hexagon' ? (
                  <polygon
                    points={`
                      ${node.x + 15},${node.y}
                      ${node.x + node.width - 15},${node.y}
                      ${node.x + node.width},${node.y + node.height / 2}
                      ${node.x + node.width - 15},${node.y + node.height}
                      ${node.x + 15},${node.y + node.height}
                      ${node.x},${node.y + node.height / 2}
                    `}
                    className={cls} style={nodeStyle}
                  />
                ) : node.shape === 'cylinder' ? (
                  <>
                    <ellipse
                      cx={node.x + node.width / 2} cy={node.y + node.height - 8}
                      rx={node.width / 2} ry="8"
                      className={cls} style={nodeStyle}
                    />
                    <rect
                      x={node.x} y={node.y + 8} width={node.width} height={node.height - 16}
                      className={cls}
                      style={{ ...nodeStyle, stroke: 'none' }}
                    />
                    <line x1={node.x} y1={node.y + 8} x2={node.x} y2={node.y + node.height - 8}
                      className={outCls} style={outlineStyle} />
                    <line x1={node.x + node.width} y1={node.y + 8} x2={node.x + node.width} y2={node.y + node.height - 8}
                      className={outCls} style={outlineStyle} />
                    <ellipse
                      cx={node.x + node.width / 2} cy={node.y + 8}
                      rx={node.width / 2} ry="8"
                      className={cls} style={nodeStyle}
                    />
                  </>
                ) : node.shape === 'subroutine' ? (
                  <>
                    <rect
                      x={node.x} y={node.y} width={node.width} height={node.height}
                      rx="3" ry="3"
                      className={cls} style={nodeStyle}
                    />
                    <line
                      x1={node.x + 8} y1={node.y}
                      x2={node.x + 8} y2={node.y + node.height}
                      className={outCls} style={outlineStyle}
                    />
                    <line
                      x1={node.x + node.width - 8} y1={node.y}
                      x2={node.x + node.width - 8} y2={node.y + node.height}
                      className={outCls} style={outlineStyle}
                    />
                  </>
                ) : (
                  <rect
                    x={node.x} y={node.y} width={node.width} height={node.height}
                    rx="3" ry="3"
                    className={cls} style={nodeStyle}
                  />
                )}

                {(() => {
                  const lines = wrapText(node.label, node.width)
                  const totalH = getTextHeight(lines)
                  const cx = node.x + node.width / 2
                  const startY = node.y + node.height / 2 - (totalH - LINE_HEIGHT) / 2
                  const textFill = node.fillColor ? '#1e293b' : undefined
                  return (
                    <text
                      x={cx} textAnchor="middle" dominantBaseline="central"
                      className="node-label"
                      style={{ pointerEvents: 'none', ...(textFill ? { fill: textFill } : {}) }}
                    >
                      {lines.map((line, i) => (
                        <tspan key={i} x={cx} y={startY + i * LINE_HEIGHT}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )
                })()}

                {showPorts && getPortPositions(node).map(port => (
                  <circle
                    key={port.key}
                    cx={port.x} cy={port.y} r="6"
                    className="port-handle"
                    onMouseDown={(e) => handlePortMouseDown(e, node.id)}
                  />
                ))}

                {isConnecting && !isConnectSource && (
                  <rect
                    x={node.x - 4} y={node.y - 4}
                    width={node.width + 8} height={node.height + 8}
                    rx="6" ry="6"
                    className="drop-target"
                  />
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
}

// ── Endpoint handle sub-component ────────────────────────────

function EndpointHandle({ x, y, pinned, onMouseDown }) {
  return (
    <g onMouseDown={onMouseDown} style={{ cursor: 'move' }}>
      {/* Larger invisible hit area */}
      <circle cx={x} cy={y} r="12" fill="transparent" />
      {/* Visible diamond shape */}
      <polygon
        points={`${x},${y - 7} ${x + 7},${y} ${x},${y + 7} ${x - 7},${y}`}
        className={`endpoint-handle ${pinned ? 'pinned' : ''}`}
      />
    </g>
  )
}
