const PdfService = {

  generateQuote(cotizacion = {}) {
    if (!window.jspdf) {
      alert('PDF no disponible. Intenta de nuevo en un momento.');
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const numero = cotizacion.numero || 'BORRADOR';

    doc.setFontSize(20);
    doc.setTextColor(11, 127, 224);
    doc.text('RMG Auto Parts', 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Cotización N° ${numero}`, 14, 30);
    doc.text(`Fecha: ${new Date().toLocaleDateString('es-CL')}`, 14, 37);
    doc.text('Validez: 7 días', 14, 44);

    let y = 58;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('PRODUCTO', 14, y);
    doc.text('CANT.', 112, y);
    doc.text('PRECIO UNIT.', 130, y);
    doc.text('SUBTOTAL', 168, y);
    doc.setDrawColor(220, 220, 220);
    doc.line(14, y + 2, 196, y + 2);
    y += 10;

    doc.setTextColor(30, 30, 30);
    STATE.cart.forEach(item => {
      const nombre = item.nombre.length > 55 ? item.nombre.substring(0, 52) + '...' : item.nombre;
      doc.text(nombre, 14, y);
      doc.text(String(item.qty), 115, y);
      doc.text(`$${item.precio.toLocaleString('es-CL')}`, 130, y);
      doc.text(`$${(item.precio * item.qty).toLocaleString('es-CL')}`, 168, y);
      y += 8;
      if (y > 270) { doc.addPage(); y = 20; }
    });

    y += 4;
    doc.setDrawColor(220, 220, 220);
    doc.line(110, y, 196, y);
    y += 7;
    doc.setFontSize(10);
    doc.text(`Neto: $${CartService.subtotal().toLocaleString('es-CL')}`, 130, y); y += 7;
    doc.text(`IVA (19%): $${CartService.iva().toLocaleString('es-CL')}`, 130, y); y += 7;
    doc.setFontSize(12);
    doc.setTextColor(11, 127, 224);
    doc.text(`Total: $${CartService.total().toLocaleString('es-CL')}`, 130, y);

    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('RMG Auto Parts · Santiago, Chile', 14, 285);

    doc.save(`cotizacion_${numero}.pdf`);
  }

};
