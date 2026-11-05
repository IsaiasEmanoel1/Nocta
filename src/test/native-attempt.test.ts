import {expect,it} from 'vitest'
import {currentNativeEvent,nativeFailureText,nativeInputFingerprint} from '../experimental/nativeAttempt'
import {webcrypto} from 'node:crypto'

it('compares the complete input, not just provider or result index, without disclosing it',async()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'crypto')
 Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true})
 try{
  const input={url:'https://example.test/video?secret=private',mimeType:'video/x-matroska',headers:{Referer:'private-ref','User-Agent':'vendor'}}
  const hash=await nativeInputFingerprint(input)
  expect(hash).toMatch(/^[a-f0-9]{24}$/)
  expect(hash).not.toContain('private')
  expect(await nativeInputFingerprint({...input,headers:{'User-Agent':'vendor',Referer:'private-ref'}})).toBe(hash)
  expect(await nativeInputFingerprint({...input,url:input.url+'2'})).not.toBe(hash)
  expect(await nativeInputFingerprint({...input,mimeType:'video/mp4'})).not.toBe(hash)
  expect(await nativeInputFingerprint({...input,headers:{...input.headers,Referer:'changed'}})).not.toBe(hash)
 }finally{if(original)Object.defineProperty(globalThis,'crypto',original)}
})
it('rejects callbacks of replaced or released sessions, even for the same source',()=>{
 expect(currentNativeEvent({sessionId:'old',event:'video',positionSeconds:0},'new')).toBe(false)
 expect(currentNativeEvent({sessionId:'new',stale:true,event:'audio',positionSeconds:0},'new')).toBe(false)
 expect(currentNativeEvent({sessionId:'new',event:'audio',positionSeconds:0},'new')).toBe(true)
 expect(currentNativeEvent({sessionId:'old',event:'progress',positionSeconds:3},undefined)).toBe(false)
})
it('startup timeout is explicit, retryable and does not claim a codec/network failure',()=>{
 const text=nativeFailureText({event:'failed',positionSeconds:4,detail:'STARTUP_TIMEOUT'})
 expect(text).toContain('45 segundos');expect(text).toContain('Tente novamente');expect(text).not.toMatch(/codec|rede/)
})
