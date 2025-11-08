// src/utils/dayjsSetup.ts

import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import 'dayjs/locale/ko';

// 플러그인 확장
dayjs.extend(isBetween);

// 로케일 설정
dayjs.locale('ko');

// 이 파일은 확장과 설정을 목적으로 하며, 명시적으로 내보낼 것이 없으므로 export {}를 사용합니다.
export {};