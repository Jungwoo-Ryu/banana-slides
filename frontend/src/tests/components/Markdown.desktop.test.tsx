import { render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const getBackendPort = vi.fn(() => '15410');
let Markdown: typeof import('@/components/shared/Markdown')['Markdown'];

beforeAll(async () => {
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: { getBackendPort } });
  ({ Markdown } = await import('@/components/shared/Markdown'));
  expect(getBackendPort).toHaveBeenCalled();
});

describe('Markdown desktop images', () => {
  afterAll(() => {
    delete (window as typeof window & { electronAPI?: unknown }).electronAPI;
  });

  it('loads backend file images from the dynamic desktop port', () => {
    render(
      <Markdown>
        {'![material](/files/materials/example.png)'}
      </Markdown>,
    );

    expect(screen.getByAltText('material')).toHaveAttribute(
      'src',
      'http://127.0.0.1:15410/files/materials/example.png',
    );
  });

  it.each([
    ['HTTP', 'http://example.com/image.png'],
    ['HTTPS', 'https://example.com/image.png'],
  ])('preserves %s image URLs', (_kind, url) => {
    render(<Markdown>{`![external](${url})`}</Markdown>);

    expect(screen.getByAltText('external')).toHaveAttribute('src', url);
  });

  it.each([
    ['data', 'data:image/png;base64,iVBORw0KGgo='],
    ['blob', 'blob:https://example.com/8c391faa'],
  ])('omits %s URLs sanitized by the existing Markdown policy', (_kind, url) => {
    render(<Markdown>{`![client-side](${url})`}</Markdown>);

    expect(screen.getByAltText('client-side')).not.toHaveAttribute('src');
  });
});
