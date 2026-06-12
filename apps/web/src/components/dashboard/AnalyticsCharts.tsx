'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

const PRODUCT_COLORS = ['#10b981', '#6366f1', '#f59e0b'];

type DailyData   = { date: string; conversations: number; messages: number };
type ProductData = { name: string; value: number };

export function AnalyticsCharts({
  dailyData,
  productData,
}: {
  dailyData: DailyData[];
  productData: ProductData[];
}) {
  const hasDaily   = dailyData.some(d => d.conversations > 0 || d.messages > 0);
  const hasProduct = productData.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Daily activity — 2/3 */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-green-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-800">Activity — Last 7 Days</h3>
        <p className="text-xs text-gray-400 mt-0.5">Conversations started and messages sent</p>
        {hasDaily ? (
          <ResponsiveContainer width="100%" height={240} className="mt-4">
            <BarChart data={dailyData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0fdf4" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} width={28} allowDecimals={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #d1fae5', fontSize: '12px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="conversations" name="Conversations" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="messages"      name="Messages"      fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[240px] mt-4 rounded-xl bg-green-50/50">
            <p className="text-sm text-gray-400">No activity in the last 7 days</p>
          </div>
        )}
      </div>

      {/* Product breakdown — 1/3 */}
      <div className="bg-white rounded-2xl border border-green-100 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-800">Messages by Bot</h3>
        <p className="text-xs text-gray-400 mt-0.5">Last 30 days</p>
        {hasProduct ? (
          <>
            <ResponsiveContainer width="100%" height={160} className="mt-4">
              <PieChart>
                <Pie
                  data={productData}
                  cx="50%" cy="50%"
                  innerRadius={45} outerRadius={70}
                  dataKey="value"
                  paddingAngle={3}
                >
                  {productData.map((_, i) => (
                    <Cell key={i} fill={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #d1fae5', fontSize: '12px' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-3">
              {productData.map((p, i) => (
                <div key={p.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: PRODUCT_COLORS[i % PRODUCT_COLORS.length] }} />
                    <span className="text-gray-600 capitalize">{p.name} bot</span>
                  </div>
                  <span className="font-semibold text-gray-700 tabular-nums">{p.value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[160px] mt-4 rounded-xl bg-green-50/50">
            <p className="text-sm text-gray-400">No data yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
