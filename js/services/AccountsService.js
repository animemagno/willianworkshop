import { db } from "../config/firebase-config.js";
import {
    collection,
    getDocs,
    addDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/**
 * Servicio para gestionar Memos y Cuentas.
 */
export class AccountsService {
    constructor() {
        this.memos = [];
        this.cuentas = [];
    }

    /**
     * Carga memos de la colección "memos"
     */
    async loadMemos() {
        try {
            const q = query(collection(db, "memos"), orderBy("fechaCreacion", "desc"));
            const snapshot = await getDocs(q);
            this.memos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return this.memos;
        } catch (error) {
            console.error("Error cargando memos:", error);
            return [];
        }
    }

    async addMemo(titulo, contenido) {
        try {
            const docData = {
                titulo,
                contenido,
                fechaCreacion: serverTimestamp(),
                fechaLocal: new Date().toLocaleDateString()
            };
            const ref = await addDoc(collection(db, "memos"), docData);
            const newItem = { id: ref.id, ...docData };
            this.memos.unshift(newItem);
            return newItem;
        } catch (error) {
            console.error("Error agregando memo:", error);
            throw error;
        }
    }

    async deleteMemo(id) {
        try {
            await deleteDoc(doc(db, "memos", id));
            this.memos = this.memos.filter(m => m.id !== id);
        } catch (error) {
            console.error("Error eliminando memo:", error);
            throw error;
        }
    }

    /**
     * Carga cuentas de la colección "cuentas"
     */
    async loadAccounts() {
        try {
            const q = query(collection(db, "cuentas"), orderBy("fechaCreacion", "desc"));
            const snapshot = await getDocs(q);
            this.cuentas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            return this.cuentas;
        } catch (error) {
            console.error("Error cargando cuentas:", error);
            return [];
        }
    }

    async addAccount(nombre, descripcion, saldo) {
        try {
            const docData = {
                nombre,
                descripcion,
                saldo: parseFloat(saldo),
                fechaCreacion: serverTimestamp(),
                estado: 'Activo'
            };
            const ref = await addDoc(collection(db, "cuentas"), docData);
            const newItem = { id: ref.id, ...docData };
            this.cuentas.unshift(newItem);
            return newItem;
        } catch (error) {
            console.error("Error agregando cuenta:", error);
            throw error;
        }
    }

    async deleteAccount(id) {
        try {
            await deleteDoc(doc(db, "cuentas", id));
            this.cuentas = this.cuentas.filter(c => c.id !== id);
        } catch (error) {
            console.error("Error eliminando cuenta:", error);
            throw error;
        }
    }
}
