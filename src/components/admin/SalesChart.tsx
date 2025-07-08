// src/components/admin/SalesChart.tsx

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface SalesData {
  date: string;
  sales: number;
}

interface SalesChartProps {
  data: SalesData[];
}

const SalesChart = ({ data }: SalesChartProps) => {
  return (
    // ResponsiveContainer를 사용하면 차트가 부모 컨테이너 크기에 맞춰 자동으로 조절됩니다.
    <ResponsiveContainer width="100%" height={400}>
      <LineChart
        data={data}
        margin={{
          top: 5,
          right: 30,
          left: 20,
          bottom: 5,
        }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis tickFormatter={(value) => new Intl.NumberFormat('ko-KR').format(Number(value))} />
        <Tooltip formatter={(value) => `${Number(value).toLocaleString()}원`} />
        <Legend />
        <Line type="monotone" dataKey="sales" name="일별 매출" stroke="#8884d8" activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default SalesChart;