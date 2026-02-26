function shapeWrap(label, shape) {
  const safe = label.replace(/"/g, '#quot;')
  switch (shape) {
    case 'round':
      return `(${safe})`
    case 'stadium':
      return `([${safe}])`
    case 'diamond':
      return `{${safe}}`
    case 'hexagon':
      return `{{${safe}}}`
    case 'circle':
      return `((${safe}))`
    case 'asymmetric':
      return `>${safe}]`
    case 'parallelogram':
      return `[/${safe}/]`
    case 'cylinder':
      return `[(${safe})]`
    case 'subroutine':
      return `[[${safe}]]`
    case 'rect':
    default:
      return `[${safe}]`
  }
}

export function generateMermaid(nodes, edges, direction = 'TD', type = 'flowchart', containers = []) {
  if (nodes.length === 0) return ''

  const lines = [`${type} ${direction}`]

  // Build set of node IDs that belong to a container
  const containedNodeIds = new Set()
  for (const c of containers) {
    for (const node of nodes) {
      if (node.containerId === c.id) containedNodeIds.add(node.id)
    }
  }

  // Emit containers as subgraph blocks with their contained nodes
  for (const c of containers) {
    const containedNodes = nodes.filter(n => n.containerId === c.id)
    lines.push(`    subgraph ${c.id} [${c.label}]`)
    for (const node of containedNodes) {
      lines.push(`        ${node.id}${shapeWrap(node.label, node.shape)}`)
    }
    lines.push(`    end`)
  }

  // Emit non-contained nodes
  for (const node of nodes) {
    if (!containedNodeIds.has(node.id)) {
      lines.push(`    ${node.id}${shapeWrap(node.label, node.shape)}`)
    }
  }

  for (const edge of edges) {
    if (edge.label) {
      lines.push(`    ${edge.from} -->|${edge.label}| ${edge.to}`)
    } else {
      lines.push(`    ${edge.from} --> ${edge.to}`)
    }
  }

  return lines.join('\n')
}
