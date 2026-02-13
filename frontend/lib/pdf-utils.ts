/**
 * PDF Canvas Utilities
 * Crops a specific area from the PDF page canvas and returns a Base64 image.
 * All cropping happens in the browser — no backend needed.
 */

/**
 * Crops a specific area from the PDF page canvas using ABSOLUTE SCREEN COORDINATES.
 * This guarantees accuracy by comparing the Selection's Screen Position vs the Canvas's Screen Position,
 * eliminating all scroll, margin, padding, and layout variables.
 * 
 * @param pdfContainer - The PDF wrapper element (used for scope)
 * @param selectionRect - The selection rectangle in SCREEN coordinates { left, top, width, height }
 * @returns Base64 string of the cropped image, or null if capture fails
 */
export const cropImageFromCanvas = (
    pdfContainer: HTMLElement,
    selectionRect: { left: number; top: number; width: number; height: number }
): string | null => {
    // 1. Iterate through potential pages
    const pages = pdfContainer.querySelectorAll('.react-pdf__Page');

    // We use Screen Coordinates for everything.
    // selectionRect.top is the vertical pixel position on the user's screen.

    for (const page of Array.from(pages)) {
        const canvas = page.querySelector('canvas');
        if (!canvas) continue;

        // 2. Get the Canvas's Screen Coordinates
        // This is the source of truth for where the image is on screen.
        const canvasRect = canvas.getBoundingClientRect();

        // 3. Check Overlap using Screen Coordinates
        // Does the selection top-edge fall within this canvas's vertical screen space?
        // Added a small tolerance (5px) for border cases.
        if (selectionRect.top >= canvasRect.top - 5 && selectionRect.top < canvasRect.bottom) {

            // 4. Calculate Relative Position
            // (Selection Screen Pos) - (Canvas Screen Pos) = (Offset inside the Canvas)
            const relativeLeft = selectionRect.left - canvasRect.left;
            const relativeTop = selectionRect.top - canvasRect.top;

            // 5. Calculate Pixel Ratio (Retina/High-DPI scaling)
            // canvas.width is actual pixels. canvasRect.width is CSS display size.
            const scaleX = canvas.width / canvasRect.width;
            const scaleY = canvas.height / canvasRect.height;

            // 6. Draw the Crop
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = selectionRect.width * scaleX;
            tempCanvas.height = selectionRect.height * scaleY;

            const ctx = tempCanvas.getContext('2d');
            if (!ctx) return null;

            ctx.drawImage(
                canvas,
                relativeLeft * scaleX,  // Source X
                relativeTop * scaleY,   // Source Y
                selectionRect.width * scaleX, // Source Width
                selectionRect.height * scaleY, // Source Height
                0, 0,                   // Dest X, Y
                tempCanvas.width,       // Dest Width
                tempCanvas.height       // Dest Height
            );

            return tempCanvas.toDataURL('image/png').split(',')[1];
        }
    }

    console.error('[pdf-utils] No matching page found for selection at screen Y:', selectionRect.top);
    return null;
};
