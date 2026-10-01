// Helpers for wrapping user documents in tags inside a prompt

export const escapeAttr = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Stop a document from closing its own wrapper tag
export const neutralizeClosingTag = (text: string, tag: string) =>
  text.replace(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
