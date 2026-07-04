function renderOrders(){

return `
<div class="container">

<h2>Mis Pedidos</h2>

${STATE.orders.length === 0 ? `
<p class="muted">No hay pedidos aún</p>
` : STATE.orders.map(order => `

<div class="card">

<h3>Pedido</h3>

<p>Estado: ${order.status}</p>

<p>Total: $${order.total.toLocaleString("es-CL")}</p>

<p>Fecha: ${new Date(order.createdAt).toLocaleString()}</p>

</div>

`).join("")}

</div>
`;
}
