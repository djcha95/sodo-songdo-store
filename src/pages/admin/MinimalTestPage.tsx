import { useState } from 'react';

const MinimalTestPage = () => {
  const [text, setText] = useState('');

  console.log('[Debug] MinimalTestPage is rendering');

  return (
    <div style={{ padding: '40px', backgroundColor: 'white' }}>
      <h1>미니멀 테스트 페이지</h1>
      <p>
        이 페이지는 오직 `useState` 하나만을 사용합니다. <br />
        여기서도 입력 문제가 발생하는지 확인해주세요.
      </p>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="여기에 연속으로 입력해보세요..."
        style={{ fontSize: '1.2rem', padding: '10px', width: '400px' }}
      />
      <p style={{ fontSize: '1.5rem', marginTop: '20px' }}>
        현재 입력된 값: <strong>{text}</strong>
      </p>
    </div>
  );
};

export default MinimalTestPage;