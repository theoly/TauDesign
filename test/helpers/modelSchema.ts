/** Test transports read the actual schema, including the supported text fallback for unknown endpoints. */
export function requestSchema(request:any):any{
 const body=request.body??request,native=body.response_format?.json_schema?.schema;if(native)return native;
 const system=body.messages?.find((message:any)=>message.role==='system')?.content??body.system??'';
 if(typeof system!=='string')return undefined;
 const text=system.split('[TAUDESIGN_JSON_SCHEMA]\n')[1]?.split('\n[/TAUDESIGN_JSON_SCHEMA]')[0];
 return text===undefined?undefined:JSON.parse(text);
}
