import { db } from "../config/firebase-config.js";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    serverTimestamp,
    addDoc,
    query,
    where,
    orderBy,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const TEMP_SALE_KEY = 'ventaEnProgreso';

export class SalesService {
    constructor() {
        this.cart = [];
        this.abonoInicial = 0;
        this.saldoPendiente = 0;
        this.currentSaleId = null;
    }

    get total() {
        return this.cart.reduce((sum, item) => sum + item.subtotal, 0);
    }

    get totalQuantity() {
        return this.cart.reduce((sum, item) => sum + item.cantidad, 0);
    }

    addToCart(product, quantity) {
        const index = this.cart.findIndex(item => item.id === product.id);

        if (index >= 0) {
            this.cart[index].cantidad += quantity;
            this.cart[index].subtotal = this.cart[index].precio * this.cart[index].cantidad;
            return index;
        } else {
            const item = {
                id: product.id,
                desc: product.descripcionTaller,
                descFactura: product.descripcionFactura || product.descripcionTaller,
                precio: product.precioVenta,
                cantidad: quantity,
                subtotal: product.precioVenta * quantity
            };
            this.cart.push(item);
            return this.cart.length - 1;
        }
    }

    removeFromCart(index) {
        if (index >= 0 && index < this.cart.length) {
            this.cart.splice(index, 1);
        }
    }

    updateCartItemQuantity(index, newQuantity) {
        if (index >= 0 && index < this.cart.length && newQuantity > 0) {
            this.cart[index].cantidad = newQuantity;
            this.cart[index].subtotal = this.cart[index].precio * newQuantity;
        }
    }

    updateCartItemPrice(index, newPrice) {
        if (index >= 0 && index < this.cart.length && newPrice >= 0) {
            this.cart[index].precio = newPrice;
            this.cart[index].subtotal = newPrice * this.cart[index].cantidad;
        }
    }

    clearCart() {
        this.cart = [];
        this.abonoInicial = 0;
        this.saldoPendiente = 0;
        this.currentSaleId = null;
    }

    setAbono(amount) {
        const total = this.total;
        if (amount > total) amount = total;
        this.abonoInicial = amount;
        this.saldoPendiente = total - amount;
    }

    async saveSale(tipo, formData, usuario) {
        if (this.cart.length === 0) throw new Error("Carrito vacío");

        const isCash = tipo === "efectivo";
        const total = this.total;
        const finalAbono = isCash ? total : this.abonoInicial;
        const finalSaldo = isCash ? 0 : this.saldoPendiente;

        if (tipo === 'credito' && this.abonoInicial === 0 && this.saldoPendiente === 0) {
            this.saldoPendiente = total;
        }

        const ventaData = {
            equipo: formData.equipo,
            cliente: formData.cliente || "LOCAL",
            ciudad: formData.cliente || "LOCAL",
            esLocal: !formData.cliente,
            tipo: tipo,
            items: this.cart,
            total: total,
            cantidadTotal: this.totalQuantity,
            abonoInicial: finalAbono,
            saldoPendiente: finalSaldo,
            fecha: serverTimestamp(),
            usuario: usuario || 'Desconocido'
        };

        const idVenta = `equipo_${formData.equipo}_${Date.now()}`;
        await setDoc(doc(db, "ventas", idVenta), ventaData);

        this.clearTempSale(usuario);
        return idVenta;
    }

    async getDailySales() {
        try {
            const hoy = new Date();
            const inicio = new Date(hoy.setHours(0, 0, 0, 0));
            const fin = new Date(hoy.setHours(23, 59, 59, 999));

            const q = query(collection(db, "ventas"),
                where("fecha", ">=", inicio),
                where("fecha", "<=", fin),
                orderBy("fecha", "desc")
            );

            const snap = await getDocs(q);
            const sales = [];
            snap.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
            return sales;
        } catch (e) {
            console.error("Error fetching daily sales:", e);
            return [];
        }
    }

    async getSalesByTeam(equipo, ciudad) {
        try {
            const ventasRef = collection(db, "ventas");

            // Simplificamos la query para evitar requerir índices compuestos complejos de Firebase
            // Consultamos solo por equipo (String para asegurar match)
            const q = query(
                ventasRef,
                where("equipo", "==", String(equipo))
            );

            const snapshot = await getDocs(q);
            let ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            // Filtrar por ciudad en memoria si se especifica
            if (ciudad && ciudad !== 'LOCAL') {
                // Normalizamos para comparación flexible
                const targetCity = ciudad.toLowerCase().trim();
                ventas = ventas.filter(v => {
                    const vCiudad = (v.ciudad || v.cliente || '').toLowerCase();
                    return vCiudad === targetCity;
                });
            } else if (!ciudad || ciudad === 'LOCAL') {
                // Si es local, tratamos de excluir los que tienen ciudad explícita diferente de LOCAL
                // O simplemente mostramos todos los del equipo si el usuario clickeó un equipo local
                // Por ahora, mostrar todos los del equipo suele ser lo esperado si no hay ciudad
            }

            // Ordenar por fecha descendiente (más reciente primero) en memoria
            return ventas.sort((a, b) => {
                const dateA = a.fecha?.seconds || 0;
                const dateB = b.fecha?.seconds || 0;
                return dateB - dateA;
            });

        } catch (error) {
            console.error("Error obteniendo ventas del equipo:", error);
            return [];
        }
    }

    async registerMovement(tipo, monto, concepto, usuario) {
        const collectionName = tipo === 'retiro' ? 'retiros' : 'ingresos';
        await addDoc(collection(db, collectionName), {
            monto: parseFloat(monto),
            concepto: concepto,
            fecha: serverTimestamp(),
            usuario: usuario || "anon",
            tipo: tipo
        });
    }

    // --- TEMPORARY STORAGE ---

    saveTempSale(formData, usuario) {
        const data = {
            ...formData,
            cart: this.cart,
            abonoInicial: this.abonoInicial,
            saldoPendiente: this.saldoPendiente,
            timestamp: Date.now()
        };
        localStorage.setItem(TEMP_SALE_KEY, JSON.stringify(data));

        if (usuario) {
            setDoc(doc(db, "ventasTemporales", usuario), {
                ...data,
                ultimaActualizacion: serverTimestamp()
            }).catch(e => console.warn("Error saving temp cloud", e));
        }
    }

    async loadTempSale(usuario) {
        const local = localStorage.getItem(TEMP_SALE_KEY);
        if (local) {
            const data = JSON.parse(local);
            if (new Date(data.timestamp).toDateString() === new Date().toDateString()) {
                return this._restoreData(data);
            }
        }

        if (usuario) {
            try {
                const snap = await getDoc(doc(db, "ventasTemporales", usuario));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.cart?.length || data.equipo) {
                        return this._restoreData(data);
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }
        return null;
    }

    _restoreData(data) {
        this.cart = data.cart || [];
        this.abonoInicial = data.abonoInicial || 0;
        this.saldoPendiente = data.saldoPendiente || 0;
        return {
            equipo: data.equipo || '',
            cliente: data.cliente || ''
        };
    }

    clearTempSale(usuario) {
        localStorage.removeItem(TEMP_SALE_KEY);
        if (usuario) {
            setDoc(doc(db, "ventasTemporales", usuario), {});
        }
    }
}
