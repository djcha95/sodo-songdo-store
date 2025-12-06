import './HeyuBeautyPage.css'
import { motion } from 'framer-motion'

export default function HeyuBeautyPage() {
  return (
    <div className="bg-[#FAFAFA] min-h-screen text-gray-800">
      {/* Hero Section */}
      <section className="relative flex flex-col items-center justify-center text-center py-16 px-6">
        <motion.img
          src="/collab/heyu/logo.png"
          alt="HEY.U BEAUTYROOM"
          className="w-40 mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        />
        <motion.h1
          className="text-3xl font-semibold tracking-tight text-[#222] mb-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          SONGDOPICK × HEY.U BEAUTYROOM
        </motion.h1>
        <p className="text-gray-500 max-w-md">
          송도의 프리미엄 뷰티케어, 특별한 혜택으로 만나보세요.
        </p>
      </section>

      {/* Image Gallery */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 px-6 mb-16">
        {[
          '/collab/heyu/space1.jpg',
          '/collab/heyu/space2.jpg',
          '/collab/heyu/space3.jpg',
          '/collab/heyu/space4.jpg',
          '/collab/heyu/space5.jpg',
          '/collab/heyu/space6.jpg',
        ].map((src, idx) => (
          <motion.img
            key={idx}
            src={src}
            alt="Heyu beautyroom interior"
            className="rounded-2xl shadow-sm object-cover w-full h-[320px]"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          />
        ))}
      </section>

      {/* Info Section */}
      <section className="text-center px-6 mb-16">
        <h2 className="text-2xl font-semibold mb-4">✨ 브랜드 소개</h2>
        <p className="text-gray-600 leading-relaxed max-w-2xl mx-auto">
          HEY.U BEAUTYROOM은 송도 프리미엄 뷰티샵으로,<br />
          기미·잡티 개선부터 속눈썹 케어, 브로우 디자인까지<br />
          가장 세련되고 고급스러운 서비스를 제공합니다.
        </p>
      </section>

      {/* Promo Section */}
      <section className="bg-white py-12 px-6 text-center shadow-inner">
        <h2 className="text-2xl font-semibold mb-4 text-[#222]">🎁 송도픽 전용 혜택</h2>
        <div className="space-y-3 text-gray-700">
          <p>• 전 시술 10% 할인</p>
          <p>• 멜라즈마 풀페이스 60만원 → <strong>30만원</strong> (50% 할인)</p>
          <p>• 르멜라 시술 <strong>25% 할인</strong></p>
        </div>
        <p className="text-gray-500 mt-4 text-sm">
          방문 시 “송도픽에서 보고 왔어요” 라고 말씀해주세요 💬
        </p>
        <a
          href="https://www.instagram.com/hey.u_beautyroom?igsh=dThjZ2I0ZThyNGJl"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-6 bg-[#222] text-white px-8 py-3 rounded-full hover:bg-gray-700 transition"
        >
          인스타그램 바로가기 ↗
        </a>
      </section>

      {/* Footer Section */}
      <footer className="text-center text-gray-400 text-sm py-8">
        <p>송도픽 × 로컬브랜드 콜라보 프로젝트 Vol.1</p>
        <p className="mt-1">© 2025 SONGDOPICK All rights reserved.</p>
      </footer>
    </div>
  )
}
