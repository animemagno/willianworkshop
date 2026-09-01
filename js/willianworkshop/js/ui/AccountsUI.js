import { formatCurrency } from "../utils/formatters.js";

export class AccountsUI {
    constructor() {
        this.els = {
            memosContainer: document.getElementById('memos-container'),
            cuentasBody: document.getElementById('cuentas-body'),
            tabButtons: document.querySelectorAll('.tab-btn'),
            tabContents: document.querySelectorAll('.tab-content')
        };
    }

    initTabs() {
        this.els.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');
                this.els.tabButtons.forEach(btn => btn.classList.remove('active'));
                this.els.tabContents.forEach(content => content.classList.remove('active'));
                button.classList.add('active');
                document.getElementById(`tab-${tabId}`).classList.add('active');
            });
        });
    }

    renderMemos(memos) {
        if (!memos || memos.length === 0) {
            this.els.memosContainer.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-sticky-note" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                    <div>No hay memos registrados</div>
                </div>`;
            return;
        }

        this.els.memosContainer.innerHTML = memos.map(m => `
            <div class="memo-item">
                <div>
                    <div class="memo-title">${m.titulo}</div>
                    <div class="memo-content">${m.contenido}</div>
                </div>
                <div class="memo-date">${m.fechaLocal || 'Hoy'}</div>
                <div class="memo-actions">
                    <button class="icon-btn btn-delete" onclick="window.eliminarMemo('${m.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    renderAccounts(cuentas) {
        if (!cuentas || cuentas.length === 0) {
            this.els.cuentasBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-cart">
                        <i class="fas fa-chart-line" style="font-size:2rem;margin-bottom:10px;opacity:.5;"></i>
                        <div>No hay cuentas registradas</div>
                    </td>
                </tr>`;
            return;
        }

        this.els.cuentasBody.innerHTML = cuentas.map(c => `
            <tr>
                <td>${c.nombre}</td>
                <td>${c.descripcion || '-'}</td>
                <td class="${c.saldo >= 0 ? 'saldo-positivo' : 'saldo-negativo'}">${formatCurrency(c.saldo)}</td>
                <td>${c.estado}</td>
                <td>
                    <button class="icon-btn btn-delete" onclick="window.eliminarCuenta('${c.id}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }

    promptNewMemo() {
        const titulo = prompt("Título del Memo:");
        if (!titulo) return null;
        const contenido = prompt("Contenido:");
        return { titulo, contenido: contenido || '' };
    }

    promptNewAccount() {
        const nombre = prompt("Nombre de la cuenta:");
        if (!nombre) return null;
        const descripcion = prompt("Descripción:");
        const saldo = parseFloat(prompt("Saldo inicial:", "0"));
        if (isNaN(saldo)) return null;

        return { nombre, descripcion, saldo };
    }
}
