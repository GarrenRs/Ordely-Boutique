import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ProviderAuthProvider, useProviderAuth } from "@/context/ProviderAuthContext";
import Layout from "@/components/Layout";
import ProviderLayout from "@/components/ProviderLayout";
import Dashboard from "@/pages/Dashboard";
import OrdersList from "@/pages/OrdersList";
import OrderDetail from "@/pages/OrderDetail";
import LandingPagesList from "@/pages/LandingPagesList";
import LandingPageForm from "@/pages/LandingPageForm";
import CustomersList from "@/pages/CustomersList";
import CustomerDetail from "@/pages/CustomerDetail";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import DeliverySystem from "@/pages/DeliverySystem";
import Login from "@/pages/Login";
import PublicLandingPage from "@/pages/PublicLandingPage";
import PublicStorePage from "@/pages/PublicStorePage";
import TrackOrder from "@/pages/TrackOrder";
import ProviderLogin from "@/pages/provider/ProviderLogin";
import ProviderDashboard from "@/pages/provider/ProviderDashboard";
import ProviderStores from "@/pages/provider/ProviderStores";
import ProviderApply from "@/pages/provider/ProviderApply";
import ProviderLeads from "@/pages/provider/ProviderLeads";
import NotFound from "@/pages/not-found";
import { Loader2 } from "lucide-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

function AdminRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/orders/confirmations" component={OrdersConfirmationsRoute} />
        <Route path="/orders" component={OrdersRoute} />
        <Route path="/orders/:orderId" component={OrderDetail} />
        <Route path="/confirmations" component={LegacyConfirmationsRedirect} />
        <Route path="/landing-pages" component={LandingPagesList} />
        <Route path="/landing-pages/new" component={LandingPageForm} />
        <Route path="/landing-pages/:pageId" component={LandingPageForm} />
        <Route path="/customers" component={CustomersList} />
        <Route path="/customers/:customerId" component={CustomerDetail} />
        <Route path="/reports" component={Reports} />
        <Route path="/delivery" component={DeliverySystem} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function OrdersConfirmationsRoute() {
  return <OrdersList initialView="confirmations" />;
}

function OrdersRoute() {
  return <OrdersList />;
}

function LegacyConfirmationsRedirect() {
  return <Redirect to="/orders/confirmations" />;
}

function LoginGuard() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (user) return <Redirect to="/" />;
  return <Login />;
}

function HomeRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  if (!user) return <ProviderApply />;
  return (
    <Layout>
      <Dashboard />
    </Layout>
  );
}

function ProviderAdminRouter() {
  const { user, isLoading } = useProviderAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }
  if (!user) return <Redirect to="/provider/login" />;

  return (
    <ProviderLayout>
      <Switch>
        <Route path="/provider" component={ProviderDashboard} />
        <Route path="/provider/stores" component={ProviderStores} />
        <Route path="/provider/leads" component={ProviderLeads} />
        <Route component={NotFound} />
      </Switch>
    </ProviderLayout>
  );
}

function ProviderLoginGuard() {
  const { user, isLoading } = useProviderAuth();
  if (isLoading) return null;
  if (user) return <Redirect to="/provider" />;
  return <ProviderLogin />;
}

function ProviderRouter() {
  return (
    <ProviderAuthProvider>
      <Switch>
        <Route path="/provider/login" component={ProviderLoginGuard} />
        <Route path="/provider/:rest*" component={ProviderAdminRouter} />
        <Route path="/provider" component={ProviderAdminRouter} />
      </Switch>
    </ProviderAuthProvider>
  );
}

function MerchantRouter() {
  return (
    <AuthProvider>
      <Switch>
        <Route path="/login" component={LoginGuard} />
        <Route path="/" component={HomeRoute} />
        <Route component={AdminRouter} />
      </Switch>
    </AuthProvider>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/provider/apply" component={ProviderApply} />
      <Route path="/provider/:rest*" component={ProviderRouter} />
      <Route path="/provider" component={ProviderRouter} />
      <Route path="/s/:storeSlug/p/:productSlug" component={PublicLandingPage} />
      <Route path="/s/:storeSlug" component={PublicStorePage} />
      <Route path="/p/:slug" component={PublicLandingPage} />
      <Route path="/track" component={TrackOrder} />
      <Route component={MerchantRouter} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
