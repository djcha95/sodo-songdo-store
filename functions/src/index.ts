// functions/src/index.ts
// 이 파일은 이제 각 기능별 파일에서 함수들을 가져와 최종적으로 export하는 역할만 합니다.

// Callable Functions
import * as productCallables from "./callable/products.js";
import * as orderCallables from "./callable/orders.js";

// HTTP Functions
import * as httpAuth from "./http/auth.js";

// Scheduled Functions
import * as scheduledNotifications from "./scheduled/notifications.js";
import * as scheduledPoints from "./scheduled/points.js";

// Firestore Trigger Functions
import * as triggerOrders from "./triggers/orders.js";
import * as triggerPoints from "./triggers/points.js";

// 각 파일에서 가져온 함수들을 하나의 객체로 모아서 export 합니다.
// 이렇게 하면 Firebase가 모든 함수를 인식할 수 있습니다.
export const callable = {
    ...productCallables,
    ...orderCallables,
};

export const http = {
    ...httpAuth,
};

export const scheduled = {
    ...scheduledNotifications,
    ...scheduledPoints,
};

export const triggers = {
    ...triggerOrders,
    ...triggerPoints,
};