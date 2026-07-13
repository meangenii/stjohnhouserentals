function hasUsableImage(image) {
  return Boolean(image?.url || image?.src)
}

function getBlockOwnImage(block) {
  if (block?.type === 'hero' || block?.type === 'image' || block?.type === 'image-text-split') {
    return hasUsableImage(block.image) ? block.image : null
  }

  if (block?.type === 'image-gallery' && Array.isArray(block.images)) {
    return block.images.find(hasUsableImage) ?? null
  }

  return null
}

// Walks a page's blocks (including one level into Group cards and Row columns) looking for the
// first usable image, so a page gets a sensible social-share image without requiring a dedicated
// "share image" field. Prefers top-level blocks over nested ones.
export function findPageShareImage(blocks) {
  if (!Array.isArray(blocks)) {
    return null
  }

  for (const block of blocks) {
    const image = getBlockOwnImage(block)

    if (image) {
      return image
    }
  }

  for (const block of blocks) {
    if (block?.type === 'group' && Array.isArray(block.items)) {
      for (const item of block.items) {
        if (hasUsableImage(item?.image)) {
          return item.image
        }

        const nestedImage = findPageShareImage(item?.blocks)

        if (nestedImage) {
          return nestedImage
        }
      }
    }

    if (block?.type === 'row' && Array.isArray(block.columns)) {
      for (const column of block.columns) {
        const nestedImage = findPageShareImage(column?.blocks)

        if (nestedImage) {
          return nestedImage
        }
      }
    }
  }

  return null
}
