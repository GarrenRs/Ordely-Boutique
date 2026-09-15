import { Router } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { publicRouter } from "./public.js";
import { storesRouter } from "./stores.js";
import { landingPagesRouter } from "./landing-pages.js";
import { ordersRouter } from "./orders.js";
import { customersRouter } from "./customers.js";
import { confirmationActionsRouter, confirmationsRouter } from "./confirmations.js";
import { reportsRouter } from "./reports.js";
import { uploadsRouter } from "./uploads.js";
import { productCategoriesRouter } from "./product-categories.js";
import { deliveryZonesRouter } from "./delivery-zones.js";
import { providerRouter } from "./provider.js";
import { requireStoreAccess } from "../middleware/requireAuth.js";

const router = Router();

router.use(healthRouter);

router.use("/auth", authRouter);
router.use("/public", publicRouter);
router.use("/provider", providerRouter);

router.use("/stores", storesRouter);
router.use("/stores/:storeId/landing-pages", requireStoreAccess, landingPagesRouter);
router.use("/stores/:storeId/product-categories", requireStoreAccess, productCategoriesRouter);
router.use("/stores/:storeId/delivery-zones", requireStoreAccess, deliveryZonesRouter);
router.use("/stores/:storeId/orders", requireStoreAccess, ordersRouter);
router.use("/stores/:storeId/customers", requireStoreAccess, customersRouter);
router.use("/stores/:storeId/confirmations", requireStoreAccess, confirmationsRouter);
router.use("/stores/:storeId/orders", requireStoreAccess, confirmationActionsRouter);
router.use("/stores/:storeId/reports", requireStoreAccess, reportsRouter);
router.use("/stores/:storeId/uploads", requireStoreAccess, uploadsRouter);

export default router;
