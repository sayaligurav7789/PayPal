import { Router, type IRouter } from "express";
import fraudshieldRouter from "./fraudshield";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(fraudshieldRouter);

export default router;
