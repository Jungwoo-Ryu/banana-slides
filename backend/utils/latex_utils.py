"""
LaTeX Tool Modules - Processing LaTeX Formula Conversion

Provide the following features：
1. Simple. LaTeX Transtext (transformation characters, simple symbols)）
2. LaTeX Turn. MathML
3. MathML Turn. OMML（For PPTX）
"""
import re
import logging
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# LaTeX Converting Character Map
LATEX_ESCAPES = {
    r'\%': '%',
    r'\$': '$',
    r'\&': '&',
    r'\#': '#',
    r'\_': '_',
    r'\{': '{',
    r'\}': '}',
    r'\ ': ' ',
    r'\,': ' ',  # thin space
    r'\;': ' ',  # thick space
    r'\!': '',   # negative thin space
    r'\quad': '  ',
    r'\qquad': '    ',
}

# Common LaTeX Symbol to Unicode Map
LATEX_SYMBOLS = {
    # Greek Letter
    r'\alpha': 'α', r'\beta': 'β', r'\gamma': 'γ', r'\delta': 'δ',
    r'\epsilon': 'ε', r'\zeta': 'ζ', r'\eta': 'η', r'\theta': 'θ',
    r'\iota': 'ι', r'\kappa': 'κ', r'\lambda': 'λ', r'\mu': 'μ',
    r'\nu': 'ν', r'\xi': 'ξ', r'\pi': 'π', r'\rho': 'ρ',
    r'\sigma': 'σ', r'\tau': 'τ', r'\upsilon': 'υ', r'\phi': 'φ',
    r'\chi': 'χ', r'\psi': 'ψ', r'\omega': 'ω',
    r'\Gamma': 'Γ', r'\Delta': 'Δ', r'\Theta': 'Θ', r'\Lambda': 'Λ',
    r'\Xi': 'Ξ', r'\Pi': 'Π', r'\Sigma': 'Σ', r'\Phi': 'Φ',
    r'\Psi': 'Ψ', r'\Omega': 'Ω',
    # Mathematical Operators
    r'\times': '×', r'\div': '÷', r'\pm': '±', r'\mp': '∓',
    r'\cdot': '·', r'\ast': '∗', r'\star': '☆',
    r'\leq': '≤', r'\le': '≤', r'\geq': '≥', r'\ge': '≥',
    r'\neq': '≠', r'\approx': '≈',
    r'\equiv': '≡', r'\sim': '∼', r'\propto': '∝',
    r'\infty': '∞', r'\partial': '∂', r'\nabla': '∇',
    r'\sum': '∑', r'\prod': '∏', r'\int': '∫',
    r'\sqrt': '√', r'\angle': '∠', r'\degree': '°',
    # Arrow
    r'\leftarrow': '←', r'\rightarrow': '→', r'\leftrightarrow': '↔',
    r'\Leftarrow': '⇐', r'\Rightarrow': '⇒', r'\Leftrightarrow': '⇔',
    # Other
    r'\dots': '…', r'\ldots': '…', r'\cdots': '⋯', r'\vdots': '⋮',
    r'\forall': '∀', r'\exists': '∃', r'\in': '∈', r'\notin': '∉',
    r'\subset': '⊂', r'\supset': '⊃', r'\cup': '∪', r'\cap': '∩',
}

# Superscript Digital Map
SUPERSCRIPT_MAP = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
    'n': 'ⁿ', 'i': 'ⁱ',
}

# Subscript Digital Map
SUBSCRIPT_MAP = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄',
    '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
    'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ',
    'i': 'ᵢ', 'j': 'ⱼ', 'n': 'ₙ', 'm': 'ₘ',
}


def is_simple_latex(latex: str) -> bool:
    """
    Whether it’s simple or not. LaTeX（Can be directly converted to text）

    Simple. LaTeX Including：
    - Purely transacting characters (e. g.) 10\%）
    - Simple symbols (e.g.) \alpha）
    - Simple superscripts and subscripts (e. g. x^2, x_1）
    """
    # Remove all known simple modes
    test = latex

    # Remove a conversion character
    for escape in LATEX_ESCAPES:
        test = test.replace(escape, '')

    # Remove Symbols
    for symbol in LATEX_SYMBOLS:
        test = test.replace(symbol, '')

    # Remove Simple Superscripts ^{...} or ^x
    test = re.sub(r'\^{[^{}]*}', '', test)
    test = re.sub(r'\^[0-9a-zA-Z]', '', test)

    # Remove Simple Subscript _{...} or _x
    test = re.sub(r'_{[^{}]*}', '', test)
    test = re.sub(r'_[0-9a-zA-Z]', '', test)

    # If the rest are ordinary characters, it’s simple. LaTeX
    remaining = test.strip()
    # Check if there are any unprocessed items. LaTeX Command
    if '\\' in remaining and not remaining.replace('\\', '').isalnum():
        return False

    return True


def latex_to_text(latex: str) -> str:
    """
    It’ll be easy. LaTeX Convert to Unicode Text

    Args:
        latex: LaTeX String

    Returns:
        Converted Text
    """
    result = latex

    # 1. Processing transliteration characters
    for escape, char in LATEX_ESCAPES.items():
        result = result.replace(escape, char)

    # 2. Process Symbols
    for symbol, char in LATEX_SYMBOLS.items():
        result = result.replace(symbol, char)

    # 3. Process Superscripts ^{...} or ^x
    def convert_superscript(match):
        content = match.group(1) if match.group(1) else match.group(2)
        return ''.join(SUPERSCRIPT_MAP.get(c, c) for c in content)

    result = re.sub(r'\^{([^{}]*)}|\^([0-9a-zA-Z])', convert_superscript, result)

    # 4. Deal Subscripts _{...} or _x
    def convert_subscript(match):
        content = match.group(1) if match.group(1) else match.group(2)
        return ''.join(SUBSCRIPT_MAP.get(c, c) for c in content)

    result = re.sub(r'_{([^{}]*)}|_([0-9a-zA-Z])', convert_subscript, result)

    # 5. Remove the remaining LaTeX Command (e.g.) \text{}, \mathrm{} Wait.）
    result = re.sub(r'\\(?:text|mathrm|mathbf|mathit|mathbb|mathcal){([^{}]*)}', r'\1', result)

    # 6. Clear excess spaces and brackets
    result = result.replace('{', '').replace('}', '')
    result = re.sub(r'\s+', ' ', result).strip()

    return result


def latex_to_mathml(latex: str) -> Optional[str]:
    """
    Yes, sir. LaTeX Convert to MathML

    Args:
        latex: LaTeX String

    Returns:
        MathML String, failed to return None
    """
    try:
        import latex2mathml.converter
        mathml = latex2mathml.converter.convert(latex)
        return mathml
    except Exception as e:
        logger.warning(f"LaTeX to MathML conversion failed: {e}")
        return None


def mathml_to_omml(mathml: str) -> Optional[str]:
    """
    Yes, sir. MathML Convert to OMML (Office Math Markup Language)

    Usage Microsoft It’s... MML2OMML.xsl Stylesheet Convert

    Args:
        mathml: MathML String

    Returns:
        OMML String, failed to return None
    """
    try:
        from lxml import etree
        import os

        # MML2OMML.xsl Stylesheet Path
        xsl_path = os.path.join(os.path.dirname(__file__), 'MML2OMML.xsl')

        if not os.path.exists(xsl_path):
            logger.warning(f"MML2OMML.xsl not found at {xsl_path}")
            return None

        # Parsing MathML
        mathml_tree = etree.fromstring(mathml.encode('utf-8'))

        # Load XSLT
        xslt_tree = etree.parse(xsl_path)
        transform = etree.XSLT(xslt_tree)

        # Convert
        omml_tree = transform(mathml_tree)
        return etree.tostring(omml_tree, encoding='unicode')

    except ImportError:
        logger.warning("lxml not installed, cannot convert to OMML")
        return None
    except Exception as e:
        logger.warning(f"MathML to OMML conversion failed: {e}")
        return None


def convert_latex_for_pptx(latex: str) -> Tuple[str, Optional[str]]:
    """
    Yes. PPTX Convert LaTeX Formula

    Args:
        latex: LaTeX String

    Returns:
        (text_fallback, omml) Divisions
        - text_fallback: Text Backup Scheme ( always worth)）
        - omml: OMML String (if conversion is successful)）
    """
    # Always generate text retreats
    text_fallback = latex_to_text(latex)

    # For simple LaTeX，I don’t need it. OMML
    if is_simple_latex(latex):
        return text_fallback, None

    # Try Generating OMML
    mathml = latex_to_mathml(latex)
    if mathml:
        omml = mathml_to_omml(mathml)
        if omml:
            return text_fallback, omml

    return text_fallback, None
