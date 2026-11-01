/**
 * MarkdownTextarea Drag-and-drop behavioural test
 *
 * Overwrite onDocumentFiles prop The file splits logic： pictures vs Non-photo。
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownTextarea } from '@/components/shared/MarkdownTextarea'

// Tools： Create a tape-specify name + MIME Type File
const makeFile = (name: string, type: string) => new File(['dummy'], name, { type })

// Tools： Synth sent to target drop Event, carry dataTransfer.files。
// Because... jsdom It’s... DataTransfer Do not autofill files，Visible Mount here file list。
const dropFiles = (target: HTMLElement, files: File[]) => {
  const dataTransfer = {
    files,
    items: files.map(f => ({ kind: 'file' as const, type: f.type, getAsFile: () => f })),
    types: ['Files'],
  }
  fireEvent.drop(target, { dataTransfer })
}

describe('MarkdownTextarea drop handling', () => {
  it('when onDocumentFiles is provided, images go to onFiles and non-images go to onDocumentFiles', () => {
    const onFiles = vi.fn()
    const onDocumentFiles = vi.fn()
    render(
      <MarkdownTextarea
        value=""
        onChange={() => {}}
        onFiles={onFiles}
        onDocumentFiles={onDocumentFiles}
      />
    )

    const editor = screen.getByRole('textbox')
    const img = makeFile('cat.png', 'image/png')
    const pdf = makeFile('report.pdf', 'application/pdf')
    dropFiles(editor, [img, pdf])

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith([img])
    expect(onDocumentFiles).toHaveBeenCalledTimes(1)
    expect(onDocumentFiles).toHaveBeenCalledWith([pdf])
  })

  it('when onDocumentFiles is NOT provided, all dropped files go to onFiles (legacy)', () => {
    const onFiles = vi.fn()
    render(
      <MarkdownTextarea
        value=""
        onChange={() => {}}
        onFiles={onFiles}
      />
    )

    const editor = screen.getByRole('textbox')
    const img = makeFile('cat.png', 'image/png')
    const pdf = makeFile('report.pdf', 'application/pdf')
    dropFiles(editor, [img, pdf])

    expect(onFiles).toHaveBeenCalledTimes(1)
    expect(onFiles).toHaveBeenCalledWith([img, pdf])
  })

  it('does not call onFiles when dropped files contain only documents', () => {
    const onFiles = vi.fn()
    const onDocumentFiles = vi.fn()
    render(
      <MarkdownTextarea
        value=""
        onChange={() => {}}
        onFiles={onFiles}
        onDocumentFiles={onDocumentFiles}
      />
    )

    const editor = screen.getByRole('textbox')
    const pdf = makeFile('report.pdf', 'application/pdf')
    const docx = makeFile(
      'notes.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    dropFiles(editor, [pdf, docx])

    expect(onFiles).not.toHaveBeenCalled()
    expect(onDocumentFiles).toHaveBeenCalledWith([pdf, docx])
  })

  it('does not call onDocumentFiles when dropped files contain only images', () => {
    const onFiles = vi.fn()
    const onDocumentFiles = vi.fn()
    render(
      <MarkdownTextarea
        value=""
        onChange={() => {}}
        onFiles={onFiles}
        onDocumentFiles={onDocumentFiles}
      />
    )

    const editor = screen.getByRole('textbox')
    const png = makeFile('a.png', 'image/png')
    const jpg = makeFile('b.jpg', 'image/jpeg')
    dropFiles(editor, [png, jpg])

    expect(onDocumentFiles).not.toHaveBeenCalled()
    expect(onFiles).toHaveBeenCalledWith([png, jpg])
  })
})
