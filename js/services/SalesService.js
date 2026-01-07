/* js/services/SalesService.js - GLOBAL VERSION COMPATIBLE WITH FILE:// AND FIREBASE V8 */
(function () {
    const TEMP_SALE_KEY = 'ventaEnProgreso';

    class SalesService {
        constructor() {
            this.cart = [];
            this.abonoInicial = 0;
            this.saldoPendiente = 0;
            this.currentSaleId = null;
            this.db = firebase.firestore();
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

            // Clean items
            const cleanItems = this.cart.map(item => ({
                id: item.id || 'unknown',
                desc: item.desc || 'Sin descripción',
                precio: Number(item.precio) || 0,
                cantidad: Number(item.cantidad) || 1,
                subtotal: Number(item.subtotal) || 0
            }));

            const ventaData = {
                equipo: String(formData.equipo || '0'),
                cliente: String(formData.cliente || "LOCAL"),
                ciudad: String(formData.cliente || "LOCAL"),
                esLocal: !formData.cliente,
                tipo: tipo,
                items: cleanItems,
                total: Number(total) || 0,
                cantidadTotal: Number(this.totalQuantity) || 0,
                abonoInicial: Number(finalAbono) || 0,
                saldoPendiente: Number(finalSaldo) || 0,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                usuario: String(usuario || 'Admin')
            };

            const idVenta = `equipo_${ventaData.equipo}_${Date.now()}`;
            console.log("💾 Guardando venta (Transaccional):", idVenta, ventaData);

            // Transacción: Guardar Venta + Descontar Stock
            await this.db.runTransaction(async (transaction) => {
                // 1. Lecturas (Stock actual)
                const productReads = [];
                for (const item of cleanItems) {
                    if (item.id && item.id !== 'unknown') {
                        const ref = this.db.collection("INVENTARIO").doc(item.id);
                        const doc = await transaction.get(ref);
                        if (doc.exists) {
                            productReads.push({ ref, doc, qty: item.cantidad });
                        }
                    }
                }

                // 2. Escrituras
                // A. Actualizar Stock
                for (const p of productReads) {
                    const currentStock = parseFloat(p.doc.data().existencia || 0);
                    const newStock = currentStock - p.qty;
                    transaction.update(p.ref, { existencia: newStock });
                }

                // B. Guardar Venta
                const ventaRef = this.db.collection("VENTAS").doc(idVenta);
                transaction.set(ventaRef, ventaData);
            });

            this.clearTempSale(usuario);
            return idVenta;
        }

        async getDailySales() {
            try {
                const hoy = new Date();
                const inicio = new Date(hoy.setHours(0, 0, 0, 0));
                const fin = new Date(hoy.setHours(23, 59, 59, 999));

                const snapshot = await this.db.collection("VENTAS")
                    .where("fecha", ">=", inicio)
                    .where("fecha", "<=", fin)
                    .orderBy("fecha", "desc")
                    .get();

                return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            } catch (e) {
                console.error("Error fetching daily sales:", e);
                return [];
            }
        }

        async getSalesByTeam(equipo, ciudad) {
            try {
                const snapshot = await this.db.collection("VENTAS")
                    .where("equipo", "==", String(equipo))
                    .get();

                let ventas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                // In-memory sort
                ventas.sort((a, b) => {
                    const dateA = a.fecha?.seconds || 0;
                    const dateB = b.fecha?.seconds || 0;
                    return dateB - dateA;
                });
                return ventas;
            } catch (error) {
                console.error("Error sales by team:", error);
                return [];
            }
        }

        async registerMovement(tipo, monto, concepto, usuario) {
            const collectionName = tipo === 'retiro' ? 'retiros' : 'ingresos';
            await this.db.collection(collectionName).add({
                monto: parseFloat(monto),
                concepto: concepto,
                fecha: firebase.firestore.FieldValue.serverTimestamp(),
                usuario: usuario || "Admin",
                tipo: tipo
            });
        }

        // Temp Storage (LocalStorage only for simplicity in legacy mode)
        saveTempSale(formData, usuario) {
            const data = {
                ...formData,
                cart: this.cart,
                abonoInicial: this.abonoInicial,
                saldoPendiente: this.saldoPendiente,
                timestamp: Date.now()
            };
            localStorage.setItem(TEMP_SALE_KEY, JSON.stringify(data));
        }

        async loadTempSale(usuario) {
            const local = localStorage.getItem(TEMP_SALE_KEY);
            if (local) {
                const data = JSON.parse(local);
                // Check if from today
                if (new Date(data.timestamp).toDateString() === new Date().toDateString()) {
                    this.cart = data.cart || [];
                    this.abonoInicial = data.abonoInicial || 0;
                    this.saldoPendiente = data.saldoPendiente || 0;
                    return {
                        equipo: data.equipo || '',
                        cliente: data.cliente || ''
                    };
                }
            }
            return null;
        }

        clearTempSale(usuario) {
            localStorage.removeItem(TEMP_SALE_KEY);
        }
    }

    // Expose globally
    window.SalesService = SalesService;
})();
