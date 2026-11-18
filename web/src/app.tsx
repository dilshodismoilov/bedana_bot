import { Redirect, Route, Switch } from 'wouter-preact';
import { AdminOrders, AdminProducts } from './pages/Admin.tsx';
import { Cart } from './pages/Cart.tsx';
import { Catalog } from './pages/Catalog.tsx';
import { OrderPage } from './pages/Order.tsx';
import { Orders } from './pages/Orders.tsx';
import { ProductPage } from './pages/Product.tsx';
import { ProductForm } from './pages/ProductForm.tsx';

// Every screen. Pages are self-contained: each fetches its own data and owns its Main/Back buttons.
export function App() {
  return (
    <Switch>
      <Route path="/" component={Catalog} />
      <Route path="/products/:id">{(p) => <ProductPage id={Number(p.id)} />}</Route>
      <Route path="/cart" component={Cart} />
      <Route path="/orders" component={Orders} />
      <Route path="/orders/:id">{(p) => <OrderPage id={Number(p.id)} />}</Route>
      <Route path="/admin" component={AdminOrders} />
      <Route path="/admin/products" component={AdminProducts} />
      <Route path="/admin/products/:id">{(p) => <ProductForm id={p.id === 'new' ? null : Number(p.id)} />}</Route>
      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}
