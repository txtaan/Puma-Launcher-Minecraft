import { Fragment, type ReactNode } from 'react'

/** Fills the {placeholders} of a translated message with React nodes, e.g. to show a version number in bold. */
export function rich(message: string, nodes: Record<string, ReactNode>): ReactNode {
  return message.split(/\{(\w+)\}/).map((part, i) => (i % 2 ? <Fragment key={i}>{nodes[part] ?? `{${part}}`}</Fragment> : part))
}
