import { Router, type IRouter } from "express";
import healthRouter from "./health";
import catalogRouter from "./catalog";
import foundationRouter from "./foundation";
import accountRouter from "./account";
import organizationsRouter from "./organizations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(catalogRouter);
router.use(foundationRouter);
router.use(accountRouter);
router.use(organizationsRouter);

export default router;
