"use client";
import dynamic from 'next/dynamic';
const BatchStudio=dynamic(()=>import('@/components/batch-studio'),{ssr:false,loading:()=> <p className="p-8">Loading batch desk…</p>});
export default function BatchPage(){return <BatchStudio/>;}
