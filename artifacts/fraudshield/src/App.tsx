import { useState, type FormEvent, type ReactNode } from 'react';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import {

  Activity, ArrowLeft, ArrowRight, Bell, BookOpenCheck, Check, CircleHelp,

  ClipboardList, Clock3, FileClock, Gauge, ListFilter, LoaderCircle, Plus,

  RefreshCw, Search, Shield, SlidersHorizontal, Trash2, X, Zap,

} from 'lucide-react';

import {

  getGetDashboardQueryKey, getGetFraudTrendsQueryKey, getGetModelMetricsQueryKey,

  getGetTransactionQueryKey, getHealthCheckQueryKey, getListAlertsQueryKey,

  getListAuditLogsQueryKey, getListEntriesQueryKey, getListInvestigationsQueryKey,

  getListRulesQueryKey, getListTransactionsQueryKey, useCreateInvestigation,

  useCreateListEntry, useCreateRule, useDeleteListEntry, useDeleteRule,

  useGetDashboard, useGetFraudTrends, useGetModelMetrics, useGetTransaction,

  useHealthCheck, useListAlerts, useListAuditLogs, useListEntries,

  useListInvestigations, useListRules, useListTransactions, useScoreTransaction,

  useUpdateAlert, useUpdateInvestigation, useUpdateRule,

} from '@workspace/api-client-react';

import type { FraudAlert, FraudRule, Investigation, RiskLevel } from '@workspace/api-client-react';



const queryClient = new QueryClient();



const navigation = [

  { href: '/', label: 'Overview', icon: Gauge },

  { href: '/transactions', label: 'Transactions', icon: Activity },

  { href: '/model-performance', label: 'Model performance', icon: SlidersHorizontal },

  { href: '/alerts', label: 'Alerts', icon: Bell },

  { href: '/investigations', label: 'Investigations', icon: ClipboardList },

  { href: '/rules', label: 'Rules', icon: ListFilter },

  { href: '/lists', label: 'Allow & block lists', icon: Shield },

  { href: '/audit', label: 'Audit trail', icon: FileClock },

];



function Shell({ children }: { children: ReactNode }) {

  const [location] = useLocation();

  const health = useHealthCheck({query:{queryKey:getHealthCheckQueryKey()}});

  return <div className="shell">

    <aside className="sidebar">

      <div className="brand-row" style={{display:'flex',alignItems:'center',gap:11,padding:'0 9px 30px'}}>

        <div className="brand-mark"><Shield size={19} strokeWidth={2.4}/></div>

        <div className="brand-copy"><div style={{fontFamily:'var(--app-font-serif)',fontSize:16,fontWeight:800,letterSpacing:'-.045em',color:'#eef5ed'}}>fraudshield</div><div style={{font:'9px var(--app-font-mono)',color:'#84a59b',letterSpacing:'.08em'}}>RESEARCH OPERATIONS</div></div>

      </div>

      <div className="sidebar-caption eyebrow" style={{color:'#688a83',padding:'0 11px 10px'}}>Workspace</div>

      <nav style={{display:'grid',gap:4}}>

        {navigation.map(({href,label,icon:Icon}) => <Link key={href} href={href} className={`navlink ${location === href ? 'active' : ''}`} data-testid={`link-nav-${href.replaceAll('/','home')}`}>

          <Icon size={16} strokeWidth={1.8}/><span className="navlabel">{label}</span>

        </Link>)}

      </nav>

      <div className="sidebar-bottom" style={{marginTop:'auto',padding:'18px 8px 12px'}}>

        <div style={{height:1,background:'#294447',marginBottom:15}}/>

        <div style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'#afc2bb'}}>

          <span style={{width:7,height:7,borderRadius:9,background:health.data ? '#72c4a0' : health.isError ? '#d77b64' : '#d4a74f'}}/>

          <span className="sidebar-bottom-copy">{health.isLoading ? 'Checking API' : health.isError ? 'API unavailable' : `API ${health.data?.status ?? 'connected'}`}</span>

        </div>

      </div>

      <div className="disclaimer">Academic prototype using the anonymized ULB credit-card benchmark. Independent of PayPal; not PayPal Fraud Protection Advanced.</div>

    </aside>

    <div className="main">

      <header className="topbar">

        <div className="eyebrow" style={{display:'flex',alignItems:'center',gap:8}}><span style={{width:6,height:6,borderRadius:8,background:'#43866c'}}/> RESEARCH ENVIRONMENT <span style={{color:'#bdc7c0'}}> / </span><span style={{color:'#354e4a'}}>{navigation.find(n=>n.href===location)?.label ?? 'Workspace'}</span></div>

        <div style={{display:'flex',alignItems:'center',gap:12}}><span className="mono" style={{fontSize:10,color:'hsl(var(--muted-foreground))'}}>ULB BENCHMARK</span><div style={{width:28,height:28,borderRadius:9,display:'grid',placeItems:'center',background:'#dcebe3',color:'#3e765e'}}><BookOpenCheck size={15}/></div></div>

      </header>

      {children}

    </div>

  </div>;

}



function PageHeading({kicker,title,description,action}:{kicker:string;title:string;description:string;action?:ReactNode}) {

  return <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:20,marginBottom:26}}>

    <div><div className="eyebrow">{kicker}</div><h1 className="page-title">{title}</h1><div className="subhead">{description}</div></div>{action}

  </div>;

}



function invalidateOperationalViews(qc: ReturnType<typeof useQueryClient>) {

  void qc.invalidateQueries({queryKey:getGetDashboardQueryKey()});

  void qc.invalidateQueries({queryKey:getListAuditLogsQueryKey()});

}



function QueryState({loading,error,empty,onRetry,children}:{loading:boolean;error:boolean;empty?:boolean;onRetry:()=>void;children?:ReactNode}) {

  if (loading) return <div className="card" style={{padding:20,display:'grid',gap:14}}><div className="loading-line" style={{width:'34%'}}/><div className="loading-line" style={{width:'100%',height:90}}/><div className="loading-line" style={{width:'72%'}}/></div>;

  if (error) return <div className="status-message" style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:14}}><span>Could not load this view from the FraudShield API.</span><button className="btn" onClick={onRetry}><RefreshCw size={13}/> Retry</button></div>;

  if (empty) return <div className="card empty"><div style={{margin:'0 auto 11px',width:38,height:38,borderRadius:12,background:'#e6efea',display:'grid',placeItems:'center',color:'#51836d'}}><CircleHelp size={18}/></div>No records are available for this view.</div>;

  return <>{children}</>;

}



function Metric({label,value,detail}:{label:string;value:unknown;detail?:string}) {

  const formatted = value === null || value === undefined ? '—' : typeof value === 'number' && label.toLowerCase().includes('precision') || typeof value === 'number' && ['Recall','F1 score'].includes(label) ? `${(Number(value)*100).toFixed(1)}%` : typeof value === 'number' ? value.toLocaleString() : String(value);

  return <div className="card metric"><div className="metric-label">{label}</div><div className="metric-value mono">{formatted}</div>{detail && <div style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginTop:5}}>{detail}</div>}</div>;

}



function formatDatasetAmount(value:number) {

  return value.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

}



function Dashboard() {

  const dash = useGetDashboard({query:{queryKey:getGetDashboardQueryKey()}});

  const trendParams={buckets:24};

  const trends = useGetFraudTrends(trendParams,{query:{queryKey:getGetFraudTrendsQueryKey(trendParams)}});

  const d = dash.data;



const rawTrends = trends.data;

const points = Array.isArray(rawTrends)

  ? rawTrends

  : Array.isArray((rawTrends as any)?.points)

    ? (rawTrends as any).points

    : Array.isArray((rawTrends as any)?.items)

      ? (rawTrends as any).items

      : [];



const peak = Math.max(

  1,

  ...points.flatMap(p => [

    p.legitimateCount ?? 0,

    p.fraudCount ?? 0,

    p.predictedHighRiskCount ?? 0

  ])

);

  return <main className="content">

    <PageHeading kicker="Portfolio / ULB benchmark" title="Risk overview" description="A traceable view of model signals across the anonymized research dataset."/>

    {d?.message && <div className="notice" style={{marginBottom:15}}>{d.message}</div>}

    <QueryState loading={dash.isLoading} error={dash.isError} onRetry={()=>void dash.refetch()}>

      {d && <div className="grid-metrics">

        <Metric label="Dataset rows" value={d.datasetRows} detail="ULB credit-card benchmark"/>

        <Metric label="Fraud rows" value={d.fraudRows} detail="Labeled benchmark cases"/>

        <Metric label="F1 score" value={d.f1Score} detail={`Model ${d.modelStatus}`}/>

        <Metric label="High-risk signals" value={d.highRiskCount} detail={`${d.openAlertCount} open alerts`}/>

      </div>}

    </QueryState>

    <div className="section-head"><div><div className="section-title">Fraud activity over dataset time</div><div className="subhead" style={{fontSize:11,marginTop:4}}>Held-out labels and high-risk predictions · elapsed hours since first transaction</div></div><span className="badge">24 BUCKETS</span></div>

    <QueryState loading={trends.isLoading} error={trends.isError} empty={!trends.isLoading&&!trends.isError&&points.length===0} onRetry={()=>void trends.refetch()}>

      <div className="card" style={{padding:'4px 16px 14px'}}>

        <div style={{display:'flex',gap:15,padding:'14px 0 0',fontSize:10,color:'hsl(var(--muted-foreground))'}}><span><i style={{display:'inline-block',width:8,height:8,background:'#86bda8',borderRadius:2,marginRight:5}}/>Legitimate</span><span><i style={{display:'inline-block',width:8,height:8,background:'#d7785d',borderRadius:2,marginRight:5}}/>Actual fraud</span><span><i style={{display:'inline-block',width:8,height:8,background:'#d3a64f',borderRadius:2,marginRight:5}}/>Predicted high risk</span></div>

        <div className="chart"><div className="chart-bars">{points.map((p,i)=><div key={`${p.bucket}-${i}`} className="bar-group" title={`Bucket ${p.bucket}: ${p.fraudCount} fraud, ${p.predictedHighRiskCount} predicted high risk`}><div className="bar legit" style={{height:`${Math.max(2,p.legitimateCount/peak*100)}%`}}/><div className="bar fraud" style={{height:`${Math.max(2,p.fraudCount/peak*100)}%`}}/><div className="bar predicted" style={{height:`${Math.max(2,p.predictedHighRiskCount/peak*100)}%`}}/></div>)}</div></div>

         <div className="chart-axis"><span>{points[0] ? `${(points[0].timeStart/3600).toFixed(0)} h` : ''}</span><span>Hours since first transaction →</span><span>{points.length ? `${(points[points.length-1].timeEnd/3600).toFixed(0)} h` : ''}</span></div>

      </div>

    </QueryState>

    <div className="section-head"><div className="section-title">Operational queues</div></div>

    <div className="grid-metrics">

      <Metric label="Open alerts" value={d?.openAlertCount ?? null} detail="Require review"/>

      <Metric label="Open investigations" value={d?.openInvestigationCount ?? null} detail="Active case queue"/>

      <Metric label="Test rows" value={d?.testRows ?? null} detail="Held-out evaluation split"/>

      <Metric label="Model availability" value={d?.modelStatus ?? null} detail="Measured benchmark model"/>

    </div>

  </main>;

}



function MetricPage() {

  const q = useGetModelMetrics({query:{queryKey:getGetModelMetricsQueryKey()}}); const m=q.data;

  return <main className="content"><PageHeading kicker="Evaluation / measured results" title="Model performance" description="Held-out benchmark measurements and classification outcomes. Values are reported as returned by the API."/>

    {m?.message&&<div className="notice" style={{marginBottom:16}}>{m.message}</div>}

    <QueryState loading={q.isLoading} error={q.isError} onRetry={()=>void q.refetch()}>{m&&<div style={{display:'grid',gap:18}}>

      <div className="grid-metrics"><Metric label="Precision" value={m.precision}/><Metric label="Recall" value={m.recall}/><Metric label="F1 score" value={m.f1Score}/><Metric label="Threshold" value={m.threshold}/></div>

      {m.status==='unavailable'&&<div className="status-message">Model evaluation is unavailable. No benchmark values are being substituted.</div>}

      <div className="layout-two">

        <section className="card" style={{padding:20}}><div className="section-title" style={{marginBottom:5}}>Confusion matrix</div><p className="subhead" style={{fontSize:11,margin:'0 0 16px'}}>Held-out test set · actual by predicted outcome</p>

          {m.confusionMatrix ? <div className="matrix"><div className="matrix-cell"><span className="eyebrow">True negative</span><strong className="mono">{m.confusionMatrix.trueNegative.toLocaleString()}</strong></div><div className="matrix-cell"><span className="eyebrow">False positive</span><strong className="mono">{m.confusionMatrix.falsePositive.toLocaleString()}</strong></div><div className="matrix-cell"><span className="eyebrow">False negative</span><strong className="mono">{m.confusionMatrix.falseNegative.toLocaleString()}</strong></div><div className="matrix-cell"><span className="eyebrow">True positive</span><strong className="mono">{m.confusionMatrix.truePositive.toLocaleString()}</strong></div></div>:<div className="empty">Confusion matrix is not available.</div>}

        </section>

        <section className="card" style={{padding:20}}><div className="section-title">Evaluation protocol</div><div style={{display:'grid',gap:14,marginTop:18}}>

          {[['Model', String(m.modelName).replace('StandardScaler + SMOTE + RandomForestClassifier', 'SMOTE + RandomForestClassifier')],['Dataset',m.dataset],['Split method',m.splitMethod],['Training rows',m.trainRows],['Test rows',m.testRows],['Fraud rows',m.fraudRows],['SMOTE applied to',m.smoteAppliedTo]].map(([label,value])=><div key={label} style={{display:'flex',justifyContent:'space-between',gap:12,borderBottom:'1px solid hsl(var(--border))',paddingBottom:10}}><span className="subhead" style={{fontSize:11}}>{label}</span><strong style={{fontSize:11,textAlign:'right'}}>{value===null||value===undefined?'—':typeof value==='number'?value.toLocaleString():value}</strong></div>)}

        </div></section>

      </div>

    </div>}</QueryState>

  </main>;

}



function Transactions() {

  const [search,setSearch]=useState(''); const [filter,setFilter]=useState(''); const [page,setPage]=useState(1); const [selected,setSelected]=useState('');

  const params={page,pageSize:25,...(search.trim()?{search:search.trim()}:{}),...(filter==='fraud'?{actualFraud:true}:filter==='legitimate'?{actualFraud:false}:filter==='high'||filter==='medium'||filter==='low'?{risk:filter[0].toUpperCase()+filter.slice(1) as RiskLevel}:{})};

  const query=useListTransactions(params,{query:{queryKey:getListTransactionsQueryKey(params)}}); const data=query.data; const items = Array.isArray(data?.items) ? data.items : []; const detail=useGetTransaction(selected,{query:{enabled:!!selected,queryKey:getGetTransactionQueryKey(selected)}});

  const score=useScoreTransaction();

  
  const testScore = useScoreTransaction();

  const [newTx, setNewTx] = useState({
    transactionId: "TEST-0001",
    time: "3600",
    amount: "100",
  });

  const [testFeatures, setTestFeatures] = useState<Record<string, number>>(
    () => Object.fromEntries(
      Array.from({ length: 28 }, (_, i) => [`V${i + 1}`, 0])
    )
  );

  const submitNewTransaction = (e: FormEvent) => {
    e.preventDefault();

    testScore.mutate({
      data: {
        transactionId: newTx.transactionId,
        time: Number(newTx.time),
        amount: Number(newTx.amount),
        features: testFeatures,
      } as any,
    });
  };


  return <main className="content"><PageHeading kicker="Dataset / labeled rows" title="Transactions" description="Browse scored rows and inspect anonymized feature values." action={<div className="eyebrow">PAGE {page}</div>}/>

    
      <section className="card" style={{ padding: 20, marginBottom: 22 }}>
        <div className="section-title">Test New Transaction</div>
        <p className="subhead" style={{ fontSize: 12, margin: "6px 0 18px" }}>
          Enter transaction details and score them with the connected fraud model.
          V1–V28 default to zero for demonstration purposes.
        </p>

        <form onSubmit={submitNewTransaction}>
          <div className="form-grid">
            <label className="form-field">
              Transaction ID
              <input
                className="field"
                required
                value={newTx.transactionId}
                onChange={e =>
                  setNewTx({ ...newTx, transactionId: e.target.value })
                }
              />
            </label>

            <label className="form-field">
              Elapsed time (seconds)
              <input
                className="field"
                type="number"
                min="0"
                step="any"
                required
                value={newTx.time}
                onChange={e =>
                  setNewTx({ ...newTx, time: e.target.value })
                }
              />
            </label>

            <label className="form-field">
              Amount (dataset units)
              <input
                className="field"
                type="number"
                min="0"
                step="any"
                required
                value={newTx.amount}
                onChange={e =>
                  setNewTx({ ...newTx, amount: e.target.value })
                }
              />
            </label>
          </div>

          <div className="section-head">
            <div className="section-title">Model features</div>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setTestFeatures(
                  Object.fromEntries(
                    Array.from({ length: 28 }, (_, i) => [`V${i + 1}`, 0])
                  )
                )
              }
            >
              Reset V1–V28
            </button>
          </div>

          <div className="feature-grid">
            {Array.from({ length: 28 }, (_, i) => {
              const key = `V${i + 1}`;
              return (
                <label className="feature-chip" key={key}>
                  <span>{key}</span>
                  <input
                    className="field"
                    type="number"
                    step="any"
                    style={{ width: 95, padding: "5px 7px" }}
                    value={testFeatures[key]}
                    onChange={e =>
                      setTestFeatures({
                        ...testFeatures,
                        [key]: Number(e.target.value),
                      })
                    }
                  />
                </label>
              );
            })}
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={testScore.isPending}
            style={{ marginTop: 18 }}
          >
            {testScore.isPending ? "Scoring..." : "Test Transaction"}
          </button>
        </form>

        {testScore.data && (
          <div className="notice" style={{ marginTop: 16 }}>
            <strong>Scoring result</strong>
            <p>
              Transaction: {newTx.transactionId}
              <br />
              Fraud probability:{" "}
              {(testScore.data.fraudProbability * 100).toFixed(2)}%
              <br />
              Risk level: {testScore.data.risk}
              <br />
              Decision: {testScore.data.policyDecision}
            </p>
          </div>
        )}

        {testScore.isError && (
          <div className="status-message" style={{ marginTop: 12 }}>
            Scoring failed. Check that the frontend backend and Python model API
            are running, then try again.
          </div>
        )}
      </section>


    <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}><div style={{position:'relative',width:260}}><Search size={14} style={{position:'absolute',left:11,top:12,color:'hsl(var(--muted-foreground))'}}/><input className="field" style={{paddingLeft:33}} placeholder="Search row or transaction ID" value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} data-testid="input-transaction-search"/></div>

    <select className="field select" style={{width:170}} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}} data-testid="select-transaction-filter"><option value="">All transactions</option><option value="fraud">Actual fraud</option><option value="legitimate">Legitimate</option><option value="high">High risk</option><option value="medium">Medium risk</option><option value="low">Low risk</option></select>

    <button className="btn" onClick={()=>void query.refetch()}><RefreshCw size={13}/> Refresh rows</button></div>

    <QueryState loading={query.isLoading} error={query.isError} empty={!query.isLoading && !query.isError && items.length === 0} onRetry={()=>void query.refetch()}>

       {data && <div className="card table-wrap"><table><thead><tr><th>Row</th><th>Transaction ID</th><th>Elapsed time</th><th>Amount (dataset units)</th><th>Actual label</th><th>Risk</th><th>Probability</th><th></th></tr></thead><tbody>

         {items.map(t => <tr key={t.id} data-testid={`row-transaction-${t.id}`}><td className="mono">{t.rowNumber.toLocaleString()}</td><td className="mono">{t.id}</td><td>{(t.time/3600).toFixed(2)} h</td><td className="mono">{formatDatasetAmount(t.amount)}</td><td><span className={`badge ${t.actualFraud?'high':'low'}`}>{t.actualFraud?'Fraud':'Legitimate'}</span></td><td><span className={`badge ${t.risk.toLowerCase()}`}>{t.risk}</span></td><td className="mono">{(t.fraudProbability*100).toFixed(2)}%</td><td><button className="btn" style={{padding:'6px 8px'}} onClick={()=>setSelected(t.id)} aria-label={`Inspect transaction ${t.id}`}><ArrowRight size={14}/></button></td></tr>)}

      </tbody></table><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderTop:'1px solid hsl(var(--border))'}}><span className="subhead" style={{fontSize:11}}>{data.datasetAvailable?`${data.total.toLocaleString()} rows in dataset`:data.message??'Dataset unavailable'}</span><div style={{display:'flex',gap:7}}><button className="btn" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft size={13}/>Previous</button><button className="btn" disabled={page*data.pageSize>=data.total} onClick={()=>setPage(p=>p+1)}>Next<ArrowRight size={13}/></button></div></div></div>}

    </QueryState>

    {data?.message&&<div className="notice" style={{marginTop:12}}>{data.message}</div>}

    {selected&&<div className="transaction-detail"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span className="eyebrow">Transaction inspection</span><button className="btn" onClick={()=>setSelected('')}><X size={14}/> Close</button></div>

      <QueryState loading={detail.isLoading} error={detail.isError} onRetry={()=>void detail.refetch()}>{detail.data&&<><h2 className="page-title" style={{fontSize:23,marginTop:22}}>Row {detail.data.rowNumber.toLocaleString()}</h2><div className="mono" style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:16}}>{detail.data.id}</div>

         <div className="grid-metrics" style={{gridTemplateColumns:'1fr 1fr'}}><Metric label="Amount · dataset units" value={formatDatasetAmount(detail.data.amount)}/><Metric label="Risk" value={detail.data.risk}/><Metric label="Fraud probability" value={`${(detail.data.fraudProbability*100).toFixed(2)}%`}/><Metric label="Actual label" value={detail.data.actualFraud?'Fraud':'Legitimate'}/></div>

        <div className="section-head"><div className="section-title">Anonymized features</div><span className="badge">V1—V28</span></div><div className="feature-grid">{Object.entries(detail.data.features).sort(([a],[b])=>Number(a.slice(1))-Number(b.slice(1))).map(([key,value])=><div key={key} className="feature-chip"><span>{key}</span><span>{value.toPrecision(4)}</span></div>)}</div>

         <div className="subhead" style={{fontSize:11,marginTop:18}}>Re-scoring applies enabled rules and exact row-ID list matches. Default policy: Low → approve; Medium/High → review.</div>

         <button className="btn btn-primary" disabled={score.isPending} style={{marginTop:10,width:'100%'}} onClick={()=>score.mutate({data:{transactionId:detail.data!.id,time:detail.data!.time,amount:detail.data!.amount,features:detail.data!.features}})}>{score.isPending?<LoaderCircle size={14} className="animate-spin"/>:<Zap size={14}/>} Score this row</button>{score.data&&<div className="notice" style={{marginTop:10}}>Model risk: {score.data.risk} · {(score.data.fraudProbability*100).toFixed(2)}% · policy: {score.data.policyDecision}{score.data.listMatch?` · ${score.data.listMatch}list match`:score.data.matchedRules.length?` · rules: ${score.data.matchedRules.join(', ')}`:' · default risk policy'}</div>}{score.isError&&<div className="status-message" style={{marginTop:10}}>Scoring request failed.</div>}

      </>}</QueryState>

    </div>}

  </main>;

}



function Alerts() {

  const qc=useQueryClient(); const [filter,setFilter]=useState('open'); const params=filter?{status:filter as 'open'|'acknowledged'|'resolved'}:undefined;

  const q=useListAlerts(params,{query:{queryKey:getListAlertsQueryKey(params)}}); const update=useUpdateAlert();
  const alerts = Array.isArray(q.data) ? q.data : Array.isArray((q.data as any)?.items) ? (q.data as any).items : [];

  const refresh=()=>{void qc.invalidateQueries({queryKey:getListAlertsQueryKey()});invalidateOperationalViews(qc);};

  const change=(a:FraudAlert,status:'acknowledged'|'resolved')=>update.mutate({id:a.id,data:{status}},{onSuccess:refresh});

  return <main className="content"><PageHeading kicker="Signals / triage" title="Alerts" description="Acknowledge and resolve model-generated high-risk holdout rows. Alerts reflect model risk; policy rules are applied when re-scoring."/>

    <div style={{display:'flex',gap:9,marginBottom:14}}><select className="field select" style={{width:180}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="open">Open alerts</option><option value="acknowledged">Acknowledged</option><option value="resolved">Resolved</option><option value="">All statuses</option></select><button className="btn" onClick={()=>void q.refetch()}><RefreshCw size={13}/>Refresh</button></div>

    <QueryState loading={q.isLoading} error={q.isError} empty={!q.isLoading&&!q.isError&&alerts.length===0} onRetry={()=>void q.refetch()}>

      {alerts.length>0&&<div className="card table-wrap"><table><thead><tr><th>Alert</th><th>Transaction</th><th>Risk</th><th>Amount (dataset units)</th><th>Probability</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead><tbody>{alerts.map(a=><tr key={a.id}><td className="mono">{a.id}</td><td className="mono">{a.transactionId}</td><td><span className={`badge ${a.risk.toLowerCase()}`}>{a.risk}</span></td><td className="mono">{formatDatasetAmount(a.amount)}</td><td className="mono">{(a.fraudProbability*100).toFixed(2)}%</td><td>{new Date(a.createdAt).toLocaleString()}</td><td><span className={`badge ${a.status}`}>{a.status.replace('_',' ')}</span></td><td><div style={{display:'flex',gap:6}}>{a.status==='open'&&<button className="btn" disabled={update.isPending} onClick={()=>change(a,'acknowledged')}><Check size={13}/>Acknowledge</button>}{a.status!=='resolved'&&<button className="btn" disabled={update.isPending} onClick={()=>change(a,'resolved')}>Resolve</button>}</div></td></tr>)}</tbody></table></div>}

    </QueryState>{update.isError&&<div className="status-message" style={{marginTop:12}}>Alert update failed. Retry the action.</div>}

  </main>;

}



function Investigations() {

  const qc=useQueryClient(); const [filter,setFilter]=useState(''); const [dialog,setDialog]=useState(false); const [editing,setEditing]=useState<Investigation|null>(null);

  const [form,setForm]=useState({transactionId:'',priority:'medium',assignee:'',notes:'',status:'open'});

  const params=filter?{status:filter as 'open'|'in_review'|'resolved'}:undefined; const q=useListInvestigations(params,{query:{queryKey:getListInvestigationsQueryKey(params)}}); const create=useCreateInvestigation();const update=useUpdateInvestigation();
  const investigations = Array.isArray(q.data) ? q.data : Array.isArray((q.data as any)?.items) ? (q.data as any).items : [];

  const invalidate=()=>{void qc.invalidateQueries({queryKey:getListInvestigationsQueryKey()});invalidateOperationalViews(qc);};

  const openEdit=(i:Investigation)=>{setEditing(i);setForm({transactionId:i.transactionId,priority:i.priority,assignee:i.assignee??'',notes:i.notes??'',status:i.status});setDialog(true);};

  const submit=(e:FormEvent)=>{e.preventDefault();if(editing){update.mutate({id:editing.id,data:{status:form.status as 'open'|'in_review'|'resolved',priority:form.priority as 'low'|'medium'|'high',assignee:form.assignee||null,notes:form.notes||null}},{onSuccess:()=>{invalidate();setDialog(false)}});}else create.mutate({data:{transactionId:form.transactionId,priority:form.priority as 'low'|'medium'|'high',assignee:form.assignee||null,notes:form.notes||null}},{onSuccess:()=>{invalidate();setDialog(false);setForm({transactionId:'',priority:'medium',assignee:'',notes:'',status:'open'})}});};

  return <main className="content"><PageHeading kicker="Casework / operator queue" title="Investigations" description="Maintain a review queue for benchmark transactions." action={<button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({transactionId:'',priority:'medium',assignee:'',notes:'',status:'open'});setDialog(true)}}><Plus size={14}/>New investigation</button>}/>

    <div style={{display:'flex',gap:9,marginBottom:14}}><select className="field select" style={{width:190}} value={filter} onChange={e=>setFilter(e.target.value)}><option value="">All investigations</option><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option></select><button className="btn" onClick={()=>void q.refetch()}><RefreshCw size={13}/>Refresh</button></div>

    <QueryState loading={q.isLoading} error={q.isError} empty={!q.isLoading&&!q.isError&&investigations.length===0} onRetry={()=>void q.refetch()}>

      {investigations.length>0&&<div className="card table-wrap"><table><thead><tr><th>Case</th><th>Transaction</th><th>Status</th><th>Priority</th><th>Assignee</th><th>Notes</th><th>Updated</th><th></th></tr></thead><tbody>{investigations.map(i=><tr key={i.id}><td className="mono">{i.id}</td><td className="mono">{i.transactionId}</td><td><span className={`badge ${i.status}`}>{i.status.replace('_',' ')}</span></td><td><span className={`badge ${i.priority==='high'?'high':i.priority==='medium'?'medium':'low'}`}>{i.priority}</span></td><td>{i.assignee||'Unassigned'}</td><td style={{maxWidth:240,overflow:'hidden',textOverflow:'ellipsis'}}>{i.notes||'—'}</td><td>{new Date(i.updatedAt).toLocaleString()}</td><td><button className="btn" onClick={()=>openEdit(i)}>Edit case</button></td></tr>)}</tbody></table></div>}

    </QueryState>

    {(create.isError||update.isError)&&<div className="status-message" style={{marginTop:12}}>Could not save the investigation. Please retry.</div>}

    {dialog&&<Dialog title={editing?'Update investigation':'New investigation'} close={()=>setDialog(false)}><form onSubmit={submit}><div className="form-grid">

      <label className="form-field full">Transaction ID<input className="field" required value={form.transactionId} disabled={!!editing} onChange={e=>setForm({...form,transactionId:e.target.value})}/></label>

      <label className="form-field">Priority<select className="field select" value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>

      {editing&&<label className="form-field">Status<select className="field select" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="open">Open</option><option value="in_review">In review</option><option value="resolved">Resolved</option></select></label>}

      <label className="form-field full">Assignee<input className="field" value={form.assignee} onChange={e=>setForm({...form,assignee:e.target.value})}/></label>

      <label className="form-field full">Investigation notes<textarea className="field" style={{height:88,padding:'9px 11px',resize:'vertical'}} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>

    </div><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn" onClick={()=>setDialog(false)}>Cancel</button><button className="btn btn-primary" disabled={create.isPending||update.isPending}>{create.isPending||update.isPending?'Saving…':editing?'Save changes':'Create investigation'}</button></div></form></Dialog>}

  </main>;

}



function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}><section className="dialog"><div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}><div><div className="eyebrow">Operator workspace</div><h2 className="dialog-title">{title}</h2></div><button className="btn" onClick={close} aria-label="Close dialog"><X size={14}/></button></div>{children}</section></div>}



function Rules() {

  const qc=useQueryClient(); const q=useListRules({query:{queryKey:getListRulesQueryKey()}});const create=useCreateRule();const update=useUpdateRule();const remove=useDeleteRule();
  const rules = Array.isArray(q.data) ? q.data : Array.isArray((q.data as any)?.items) ? (q.data as any).items : [];

  const [dialog,setDialog]=useState(false);const [editing,setEditing]=useState<FraudRule|null>(null);const [name,setName]=useState('');const [field,setField]=useState('fraudProbability');const [operator,setOperator]=useState('gte');const [value,setValue]=useState('');const [action,setAction]=useState('review');

  const refresh=()=>{void qc.invalidateQueries({queryKey:getListRulesQueryKey()});invalidateOperationalViews(qc);};

  const edit=(r:FraudRule)=>{setEditing(r);setName(r.name);setField(r.field);setOperator(r.operator);setValue(String(r.value));setAction(r.action);setDialog(true);};

  const openCreate=()=>{setEditing(null);setName('');setField('fraudProbability');setOperator('gte');setValue('');setAction('review');setDialog(true);};

  const save=(e:FormEvent)=>{e.preventDefault();const input={name,field:field as 'amount'|'fraudProbability'|'time',operator:operator as 'gt'|'gte'|'lt'|'lte',value:Number(value),action:action as 'approve'|'review'|'decline'};if(editing)update.mutate({id:editing.id,data:{name,value:Number(value),action:input.action}},{onSuccess:()=>{refresh();setDialog(false)}});else create.mutate({data:input},{onSuccess:()=>{refresh();setDialog(false)}});};

  return <main className="content"><PageHeading kicker="Decision logic / governance" title="Fraud rules" description="Create, tune, enable, and remove deterministic review rules." action={<button className="btn btn-primary" onClick={openCreate}><Plus size={14}/>Create rule</button>}/>

    <QueryState loading={q.isLoading} error={q.isError} empty={!q.isLoading&&!q.isError&&rules.length===0} onRetry={()=>void q.refetch()}>{rules.length>0&&<div className="card">{rules.map(r=><div className="list-row" key={r.id}><div style={{display:'flex',alignItems:'center',gap:13,minWidth:0}}><div style={{width:34,height:34,borderRadius:10,background:r.enabled?'#e0eee6':'hsl(var(--muted))',display:'grid',placeItems:'center',color:r.enabled?'#48836a':'hsl(var(--muted-foreground))'}}><Zap size={16}/></div><div style={{minWidth:0}}><div style={{fontSize:13,fontWeight:700}}>{r.name}</div><div className="mono" style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginTop:4}}>{r.field} {r.operator} {r.value} <span style={{padding:'0 4px'}}>→</span>{r.action}</div></div></div><div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}><button className={`btn ${r.enabled?'':'btn-danger'}`} onClick={()=>update.mutate({id:r.id,data:{enabled:!r.enabled}},{onSuccess:refresh})}>{r.enabled?'Enabled':'Disabled'}</button><button className="btn" onClick={()=>edit(r)}>Edit</button><button className="btn btn-danger" aria-label={`Delete ${r.name}`} onClick={()=>{if(window.confirm(`Delete rule “${r.name}”?`))remove.mutate({id:r.id},{onSuccess:refresh})}}><Trash2 size={14}/></button></div></div>)}</div>}</QueryState>

    {(create.isError||update.isError||remove.isError)&&<div className="status-message" style={{marginTop:12}}>Rule change failed. The current server state has been retained.</div>}

    {dialog&&<Dialog title={editing?'Edit fraud rule':'Create fraud rule'} close={()=>setDialog(false)}><form onSubmit={save}><div className="form-grid">

      <label className="form-field full">Rule name<input className="field" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>

      <label className="form-field">Transaction field<select className="field select" disabled={!!editing} value={field} onChange={e=>setField(e.target.value)}><option value="amount">Amount</option><option value="fraudProbability">Fraud probability</option><option value="time">Time</option></select></label>

      <label className="form-field">Condition<select className="field select" disabled={!!editing} value={operator} onChange={e=>setOperator(e.target.value)}><option value="gt">Greater than</option><option value="gte">At least</option><option value="lt">Less than</option><option value="lte">At most</option></select></label>

      <label className="form-field">Value<input className="field" type="number" min="0" step="any" required value={value} onChange={e=>setValue(e.target.value)}/></label>

      <label className="form-field">Action<select className="field select" value={action} onChange={e=>setAction(e.target.value)}><option value="approve">Approve</option><option value="review">Review</option><option value="decline">Decline</option></select></label>

    </div><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn" onClick={()=>setDialog(false)}>Cancel</button><button className="btn btn-primary" disabled={create.isPending||update.isPending}>{editing?'Save rule':'Create rule'}</button></div></form></Dialog>}

  </main>;

}



function Lists() {

  const qc=useQueryClient();const [kind,setKind]=useState('');const params=kind?{kind:kind as 'allow'|'block'}:undefined;const q=useListEntries(params,{query:{queryKey:getListEntriesQueryKey(params)}});const create=useCreateListEntry();const remove=useDeleteListEntry();
  const entries = Array.isArray(q.data) ? q.data : Array.isArray((q.data as any)?.items) ? (q.data as any).items : [];

  const [dialog,setDialog]=useState(false);const [value,setValue]=useState('');const [reason,setReason]=useState('');const [entryKind,setEntryKind]=useState('block');

  const refresh=()=>{void qc.invalidateQueries({queryKey:getListEntriesQueryKey()});invalidateOperationalViews(qc);};

  const add=(e:FormEvent)=>{e.preventDefault();create.mutate({data:{kind:entryKind as 'allow'|'block',value,reason:reason||null}},{onSuccess:()=>{refresh();setDialog(false);setValue('');setReason('')}});};

  return <main className="content"><PageHeading kicker="Reference controls / list management" title="Allow & block lists" description="Match exact local row references while re-scoring (for example ULB-000006). The source has no customer or merchant identifiers." action={<button className="btn btn-primary" onClick={()=>setDialog(true)}><Plus size={14}/>Add entry</button>}/>

    <div style={{display:'flex',gap:9,marginBottom:14}}><select className="field select" style={{width:190}} value={kind} onChange={e=>setKind(e.target.value)}><option value="">All entries</option><option value="allow">Allowlist</option><option value="block">Blocklist</option></select><button className="btn" onClick={()=>void q.refetch()}><RefreshCw size={13}/>Refresh</button></div>

    <QueryState loading={q.isLoading} error={q.isError} empty={!q.isLoading&&!q.isError&&entries.length===0} onRetry={()=>void q.refetch()}>{entries.length>0&&<div className="card table-wrap"><table><thead><tr><th>List</th><th>Value</th><th>Reason</th><th>Created</th><th>Action</th></tr></thead><tbody>{entries.map(e=><tr key={e.id}><td><span className={`badge ${e.kind}`}>{e.kind}</span></td><td className="mono">{e.value}</td><td>{e.reason||'—'}</td><td>{new Date(e.createdAt).toLocaleString()}</td><td><button className="btn btn-danger" onClick={()=>{if(window.confirm(`Remove ${e.value} from the ${e.kind}list?`))remove.mutate({id:e.id},{onSuccess:refresh})}}><Trash2 size={13}/>Remove</button></td></tr>)}</tbody></table></div>}</QueryState>

    {(create.isError||remove.isError)&&<div className="status-message" style={{marginTop:12}}>List operation failed. Please retry.</div>}

    {dialog&&<Dialog title="Add list entry" close={()=>setDialog(false)}><form onSubmit={add}><div className="form-grid">

      <label className="form-field">List type<select className="field select" value={entryKind} onChange={e=>setEntryKind(e.target.value)}><option value="block">Blocklist</option><option value="allow">Allowlist</option></select></label>

      <label className="form-field">Value<input className="field" required maxLength={200} value={value} onChange={e=>setValue(e.target.value)}/></label>

      <label className="form-field full">Reason<textarea className="field" style={{height:75,padding:'9px 11px'}} value={reason} onChange={e=>setReason(e.target.value)}/></label>

    </div><div style={{display:'flex',justifyContent:'flex-end',gap:8}}><button type="button" className="btn" onClick={()=>setDialog(false)}>Cancel</button><button className="btn btn-primary" disabled={create.isPending}>Add entry</button></div></form></Dialog>}

  </main>;

}



function Audit() {

  const params={limit:100};const q=useListAuditLogs(params,{query:{queryKey:getListAuditLogsQueryKey(params)}});
  const logs = Array.isArray(q.data) ? q.data : Array.isArray((q.data as any)?.items) ? (q.data as any).items : [];

  return <main className="content"><PageHeading kicker="Governance / operator history" title="Audit trail" description="A chronological record of actions performed in this research workspace."/>

    <QueryState loading={q.isLoading} error={q.isError} empty={!q.isLoading&&!q.isError&&logs.length===0} onRetry={()=>void q.refetch()}>{logs.length>0&&<div className="card">{logs.map((log,i)=><div className="list-row" key={log.id} style={{alignItems:'flex-start'}}><div style={{display:'flex',gap:13}}><div style={{width:30,height:30,borderRadius:9,background:'#e8efea',color:'#52806a',display:'grid',placeItems:'center',flexShrink:0}}>{i===0?<Activity size={14}/>:<Clock3 size={14}/>}</div><div><div style={{fontSize:12,fontWeight:700}}>{log.summary}</div><div style={{display:'flex',gap:8,marginTop:6,alignItems:'center'}}><span className="badge">{log.action}</span><span className="subhead" style={{fontSize:10}}>{log.entity}{log.entityId?` · ${log.entityId}`:''}</span></div></div></div><div className="mono" style={{fontSize:10,color:'hsl(var(--muted-foreground))',whiteSpace:'nowrap'}}>{new Date(log.createdAt).toLocaleString()}</div></div>)}</div>}</QueryState>

  </main>;

}



function NotFound() {return <main className="content"><div className="card empty"><h1 className="page-title">This route is not in the workspace.</h1><Link href="/" className="btn btn-primary" style={{marginTop:12}}>Return to overview</Link></div></main>}

function Router() {

 return <Shell><Switch>

  <Route path="/" component={Dashboard}/><Route path="/transactions" component={Transactions}/><Route path="/model-performance" component={MetricPage}/><Route path="/alerts" component={Alerts}/><Route path="/investigations" component={Investigations}/><Route path="/rules" component={Rules}/><Route path="/lists" component={Lists}/><Route path="/audit" component={Audit}/><Route component={NotFound}/>

 </Switch></Shell>;

}

function App() {return <QueryClientProvider client={queryClient}><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router/></WouterRouter></QueryClientProvider>;}

export default App;
