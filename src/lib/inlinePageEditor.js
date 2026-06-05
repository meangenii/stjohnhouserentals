function cloneValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function updateValueAtPath(root, path, nextValue) {
  if (!path.length) {
    return nextValue
  }

  const nextRoot = cloneValue(root)
  let target = nextRoot

  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index]
    const nextSegment = path[index + 1]

    if (target[segment] == null) {
      target[segment] = typeof nextSegment === 'number' ? [] : {}
    }

    target = target[segment]
  }

  target[path[path.length - 1]] = nextValue
  return nextRoot
}

export function createInlinePageEditorValue({ activeFieldId, disabled = false, onChange, setActiveFieldId }) {
  return {
    activeFieldId,
    disabled,
    setActiveFieldId,
    updatePath(path, nextValue) {
      onChange((currentValue) => updateValueAtPath(currentValue, path, nextValue))
    },
  }
}
