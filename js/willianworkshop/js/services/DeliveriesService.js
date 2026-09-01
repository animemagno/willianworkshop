import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Servicio para gestionar la colección de "entregas".
 */
export class DeliveriesService {
    constructor() {
        this.entregas = [];
    }

    /**
     * Carga todas las entregas ordenadas por fecha
     * @returns {Promise<Array>}
     */
    async loadAll() {
        try {
            const q = query(collection(db, "entregas"), orderBy("fechaCreacion", "desc"));
            const snapshot = await getDocs(q);

            this.entregas = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            return this.entregas;
        } catch (error) {
            console.error("Error cargando entregas:", error);
            // Return empty if fails or collection doesn't exist yet
            return [];
        }
    }

    async addDelivery(data) {
        try {
            const docData = {
                ...data, // cliente, equipo, fecha, estado: 'pendiente'
                fechaCreacion: serverTimestamp()
            };
            const docRef = await addDoc(collection(db, "entregas"), docData);
            const newDelivery = { id: docRef.id, ...docData };
            this.entregas.unshift(newDelivery);
            return newDelivery;
        } catch (error) {
            console.error("Error agregando entrega:", error);
            throw error;
        }
    }

    async updateStatus(id, newStatus) {
        try {
            await updateDoc(doc(db, "entregas", id), { estado: newStatus });
            const index = this.entregas.findIndex(e => e.id === id);
            if (index !== -1) {
                this.entregas[index].estado = newStatus;
            }
        } catch (error) {
            console.error("Error actualizando estado:", error);
            throw error;
        }
    }

    async deleteDelivery(id) {
        try {
            await deleteDoc(doc(db, "entregas", id));
            this.entregas = this.entregas.filter(e => e.id !== id);
        } catch (error) {
            console.error("Error eliminando entrega:", error);
            throw error;
        }
    }

    /**
     * Genera e imprime el recibo de entrega con el diseño especificado
     * @param {string} id - ID de la entrega
     */
    printReceipt(id) {
        const entrega = this.entregas.find(e => e.id === id);
        if (!entrega) {
            alert("Entrega no encontrada");
            return;
        }

        // Extraer mes y año de la fecha
        const fecha = new Date(entrega.fecha || new Date());
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
            'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const mes = meses[fecha.getMonth()];
        const año = fecha.getFullYear();

        // Generar las filas de la tabla (días 1-31)
        let filasTabla = '';
        for (let dia = 1; dia <= 31; dia++) {
            filasTabla += `
                <tr>
                    <td style="border: 1px solid #000; padding: 4px 8px; text-align: center;">${dia}</td>
                    <td style="border: 1px solid #000; padding: 4px 8px;"></td>
                    <td style="border: 1px solid #000; padding: 4px 8px;"></td>
                </tr>
            `;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Recibo de Entrega</title>
                <style>
                    @page {
                        size: letter;
                        margin: 0.5in;
                    }
                    body {
                        font-family: Arial, sans-serif;
                        font-size: 11pt;
                        margin: 0;
                        padding: 20px;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 20px;
                    }
                    .header h3 {
                        margin: 5px 0;
                        font-size: 11pt;
                        font-weight: normal;
                    }
                    .info-section {
                        margin-bottom: 15px;
                    }
                    .info-row {
                        display: flex;
                        justify-content: space-between;
                        margin-bottom: 8px;
                    }
                    .info-label {
                        font-size: 10pt;
                    }
                    table {
                        width: 60%;
                        border-collapse: collapse;
                        margin-bottom: 15px;
                    }
                    table td {
                        border: 1px solid #000;
                        padding: 4px 8px;
                    }
                    .right-info {
                        position: absolute;
                        right: 60px;
                        top: 140px;
                        width: 35%;
                    }
                    .right-info div {
                        margin-bottom: 8px;
                        font-size: 10pt;
                    }
                    .total-row {
                        font-weight: bold;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h3>RECIBO DE INGRESO EN CONCEPTO DE TRANSPORTE PÚBLICO</h3>
                    <h3>ALTERNATIVO LOCAL</h3>
                </div>

                <div class="info-section">
                    <div class="info-row">
                        <span class="info-label">MES: <u>${mes}</u></span>
                        <span class="info-label">AÑO: <u>${año}</u></span>
                    </div>
                </div>

                <div style="position: relative;">
                    <table>
                        <tbody>
                            ${filasTabla}
                            <tr class="total-row">
                                <td style="border: 1px solid #000; padding: 4px 8px; text-align: center;">TOTAL</td>
                                <td style="border: 1px solid #000; padding: 4px 8px;"></td>
                                <td style="border: 1px solid #000; padding: 4px 8px;"></td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="right-info">
                        <div>PLACA: _____________________</div>
                        <div>SEÑOR: _____________________</div>
                        <div>DUI: _____________________</div>
                        <div style="margin-top: 30px;">TOTAL: _____________________</div>
                        <div>FIRMA: _____________________</div>
                    </div>
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();

        setTimeout(() => {
            printWindow.print();
        }, 250);
    }
}
