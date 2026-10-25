import { Router, type IRouter } from "express";
import modelRouter from "./model";
import opsRouter from "./ops";

const router: IRouter = Router();

router.use(modelRouter);
router.use(opsRouter);

export default router;
