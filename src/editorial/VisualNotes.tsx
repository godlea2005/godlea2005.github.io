import { useState } from 'react'
import { ModalSurface } from '../components/ModalSurface'
import type { VisualNote } from './types'
import { visualNotes } from './index'
import './visual-notes.css'

export type VisualNotesProps = { items?: readonly VisualNote[] }

const noteTitles: Readonly<Record<string, string>> = {
  'signal-desk': '内容工作流的安静桌面',
  'paper-systems': '纸张与材质系统',
  'night-interface': '夜色里的界面反光',
  'prototype-hands': '桌面上的原型推敲',
  'material-study': '金属与纸张的材质研究',
  'quiet-window': '雨夜工作室窗口',
}

function noteTitle(note: VisualNote) {
  return noteTitles[note.id] ?? note.caption
}

export function VisualNotes({ items = visualNotes }: VisualNotesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failedImageIds, setFailedImageIds] = useState<ReadonlySet<string>>(() => new Set())
  const selectedNote = items.find((item) => item.id === selectedId)

  const markImageFailed = (id: string) => {
    setFailedImageIds((failed) => {
      if (failed.has(id)) return failed
      return new Set(failed).add(id)
    })
  }

  return <section className="visual-notes-section" aria-labelledby="visual-notes-heading">
    <header className="visual-notes-heading">
      <p className="visual-notes-eyebrow">FIELD NOTES / OBSERVATIONS</p>
      <h2 id="visual-notes-heading">视觉随记</h2>
      <p>把工作现场、材质线索与还没定论的想法，留成一组可以回看的片段。</p>
    </header>
    <div className="visual-notes-wall">
      {items.map((note) => {
        const failed = failedImageIds.has(note.id)
        return <figure
          className={`visual-note-figure${failed ? ' is-image-error' : ''}`}
          data-ratio={note.ratio}
          key={note.id}
        >
          <div className="visual-note-artwork">
            <img
              className="visual-note-image"
              src={note.image}
              alt={note.alt}
              loading="lazy"
              decoding="async"
              aria-hidden={failed || undefined}
              onError={() => markImageFailed(note.id)}
            />
            <span
              className="visual-note-image-fallback"
              role={failed ? 'img' : undefined}
              aria-label={failed ? note.alt : undefined}
              aria-hidden={!failed}
            />
            <button
              className="visual-note-trigger"
              type="button"
              aria-label={`查看：${noteTitle(note)}`}
              onClick={() => setSelectedId(note.id)}
            >
              <span aria-hidden="true">↗</span>
            </button>
          </div>
          <figcaption className="visual-note-caption">
            <p>{note.caption}</p>
            <time dateTime={note.date}>{note.date}</time>
          </figcaption>
        </figure>
      })}
    </div>

    {selectedNote && <ModalSurface
      className="visual-note-modal-layer"
      label={`视觉随记：${noteTitle(selectedNote)}`}
      onClose={() => setSelectedId(null)}
    >
      <article className="visual-note-dialog">
        <header className="visual-note-dialog-header">
          <div>
            <p>FIELD NOTES / DETAIL</p>
            <h2>{noteTitle(selectedNote)}</h2>
          </div>
          <button type="button" data-modal-focus onClick={() => setSelectedId(null)} aria-label="关闭视觉随记">
            ×
          </button>
        </header>
        <figure className={`visual-note-detail-figure${failedImageIds.has(selectedNote.id) ? ' is-image-error' : ''}`} data-ratio={selectedNote.ratio}>
          <div className="visual-note-detail-artwork">
            <img
              className="visual-note-image"
              src={selectedNote.image}
              alt={selectedNote.alt}
              loading="eager"
              decoding="async"
              aria-hidden={failedImageIds.has(selectedNote.id) || undefined}
              onError={() => markImageFailed(selectedNote.id)}
            />
            <span
              className="visual-note-image-fallback"
              role={failedImageIds.has(selectedNote.id) ? 'img' : undefined}
              aria-label={failedImageIds.has(selectedNote.id) ? selectedNote.alt : undefined}
              aria-hidden={!failedImageIds.has(selectedNote.id)}
            />
          </div>
          <figcaption className="visual-note-caption">
            <p>{selectedNote.caption}</p>
            <time dateTime={selectedNote.date}>{selectedNote.date}</time>
          </figcaption>
        </figure>
      </article>
    </ModalSurface>}
  </section>
}
