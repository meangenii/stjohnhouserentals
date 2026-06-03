const propertyNameCollator = new Intl.Collator(undefined, {
  sensitivity: 'base',
  numeric: true,
  ignorePunctuation: true,
})

export function comparePropertyNames(leftProperty, rightProperty) {
  const leftName = String(leftProperty?.name ?? '').trim()
  const rightName = String(rightProperty?.name ?? '').trim()

  if (!leftName || !rightName) {
    if (leftName && !rightName) {
      return -1
    }

    if (!leftName && rightName) {
      return 1
    }

    return 0
  }

  return propertyNameCollator.compare(leftName, rightName)
}
