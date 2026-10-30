import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TextStyleSelector } from '@/components/shared/TextStyleSelector';
import * as endpoints from '@/api/endpoints';

vi.mock('@/api/endpoints', () => ({
  extractStyleFromImage: vi.fn(),
  generateStyleFromContent: vi.fn(),
  listUserStyleTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  createUserStyleTemplate: vi.fn(),
  deleteUserStyleTemplate: vi.fn(),
}));

describe('TextStyleSelector Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly with default props', () => {
    render(<TextStyleSelector value="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Generate from content|\u6839\u636e\u5185\u5bb9\u751f\u6210\u98ce\u683c/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Extract from image|\u4ece\u56fe\u7247\u63d0\u53d6\u98ce\u683c/i })).toBeInTheDocument();
  });

  it('shows error toast when sourceContent is empty and generate button clicked', () => {
    const handleToast = vi.fn();
    render(<TextStyleSelector value="" onChange={vi.fn()} onToast={handleToast} sourceContent="" />);

    const generateBtn = screen.getByRole('button', { name: /Generate from content|\u6839\u636e\u5185\u5bb9\u751f\u6210\u98ce\u683c/i });
    fireEvent.click(generateBtn);

    expect(handleToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
      })
    );
    expect(endpoints.generateStyleFromContent).not.toHaveBeenCalled();
  });

  it('calls generateStyleFromContent and updates value when sourceContent is provided', async () => {
    const handleChange = vi.fn();
    const handleToast = vi.fn();
    (endpoints.generateStyleFromContent as any).mockResolvedValueOnce({
      data: { style_description: 'Visual description： Technological style\n Colours and Materials：#0B0F19' },
    });

    render(
      <TextStyleSelector
        value=""
        onChange={handleChange}
        onToast={handleToast}
        sourceContent="Quantum computing and future artificial intelligence development"
      />
    );

    const generateBtn = screen.getByRole('button', { name: /Generate from content|\u6839\u636e\u5185\u5bb9\u751f\u6210\u98ce\u683c/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(endpoints.generateStyleFromContent).toHaveBeenCalledWith('Quantum computing and future artificial intelligence development', expect.any(String));
      expect(handleChange).toHaveBeenCalledWith('Visual description： Technological style\n Colours and Materials：#0B0F19');
      expect(handleToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
        })
      );
    });
  });

  it('handles error gracefully when generateStyleFromContent fails', async () => {
    const handleChange = vi.fn();
    const handleToast = vi.fn();
    (endpoints.generateStyleFromContent as any).mockRejectedValueOnce(
      new Error('Network error')
    );

    render(
      <TextStyleSelector
        value=""
        onChange={handleChange}
        onToast={handleToast}
        sourceContent="Quantum computing and future artificial intelligence development"
      />
    );

    const generateBtn = screen.getByRole('button', { name: /Generate from content|\u6839\u636e\u5185\u5bb9\u751f\u6210\u98ce\u683c/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(handleToast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
        })
      );
      expect(handleChange).not.toHaveBeenCalled();
    });
  });
});

