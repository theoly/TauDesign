import React from 'react';
import {useT} from '../../stores/useLocaleStore';
import {userFacingMessage} from '../../utils/userFacingMessage';

/** Only application notices belong here. User/model prose and source code must remain untouched. */
export function UserFacingNotice({message}:{message:string}){
 const t=useT();
 const text=userFacingMessage(message);
 return <><span>{text}</span>{text!==message&&<details data-technical-details className="mt-1 text-[10px] font-normal text-slate-500"><summary className="cursor-pointer">{t('repair.technicalDetails')}</summary><p className="mt-1 whitespace-pre-wrap break-words">{message}</p></details>}</>;
}
