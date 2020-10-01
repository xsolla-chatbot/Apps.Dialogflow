import { IHttp, IHttpRequest, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IDialogflowEvent, DialogflowRequestType, IDialogflowMessage, LanguageCode, IDialogflowQuickReplies, ENTITY_OVERRIDE_MODE_ } from '../enum/Dialogflow';
import { Logs } from '../enum/Logs';
import { Headers } from '../enum/Http';
import { DialogflowClass } from './Dialogflow';
import { performHandover, updateRoomCustomFields } from './Room';
import { ILivechatRoom, IVisitor } from '@rocket.chat/apps-engine/definition/livechat';
import { createHttpRequest } from './Http';


class DialogflowExtClass extends DialogflowClass {
    public async sendRequest(
        http: IHttp,
         read: IRead,
         modify: IModify,
         sessionId: string,
         request: IDialogflowEvent | string,
         requestType: DialogflowRequestType,
         visitorToken: string = ""): Promise<IDialogflowMessage> {

        const serverURL = await this.getServerURL(read, modify, http, sessionId);

        const queryInput = {
            ...requestType === DialogflowRequestType.EVENT && { event: request },
            ...requestType === DialogflowRequestType.MESSAGE && { text: { languageCode: LanguageCode.EN, text: request } },
        };

        const httpRequestContent: IHttpRequest = createHttpRequest(
            { 'Content-Type': Headers.CONTENT_TYPE_JSON, 'Accept': Headers.ACCEPT_JSON },
            { queryInput },
        );

        try {
            const response = await http.post(serverURL, httpRequestContent);
            this.doAsync(response.data, read, modify, sessionId, visitorToken);
            return this.parseRequest(response.data);
        } catch (error) {
            throw new Error(`${ Logs.HTTP_REQUEST_ERROR }`);
        }
    }

    private async doAsync(response: any, read: IRead, modify: IModify, sessionId: string, token: string) {
        if (!response) { throw new Error(Logs.INVALID_RESPONSE_FROM_DIALOGFLOW_CONTENT_UNDEFINED); }
        //fill visitor custom fields in livechat room
        await this.fillCustomFields(response, read, modify, token);
        //check is need execute handover
        this.executeHandover(response, read, modify, sessionId, token);
        

    }

    private async executeHandover(response: any, read: IRead, modify: IModify, sessionId: string, token: string) {
        const { queryResult: { parameters } } = response;

        if(!parameters)
            return;

        const { handover } = parameters;
        
        if(handover) {
            performHandover(modify, read, sessionId, token, handover);
        }
    }

    private async fillCustomFields(response: any, read: IRead, modify: IModify, token: string) {
        const vInfo = await this.getVisitorInfo(read, token);

        if(!vInfo) 
            return;
            

        const liveChatUpdater = modify.getUpdater().getLivechatUpdater();

        const { queryResult: { parameters } } = response;

        try {
            if(parameters) {
                for(let key in parameters) {
                    if(vInfo[key]) {
                        liveChatUpdater.setCustomFields(token, key, parameters[key], true);
                    }
                }
            }
        }
        catch(error) {
            throw new Error(Logs.INVALID_RESPONSE_FROM_DIALOGFLOW);
        }
    }

      

    public async executeCommand(http: IHttp,
        read: IRead,
        modify: IModify,
        sessionId: string,
        request: IDialogflowEvent | string,
        token: string = "") {

        let message : IDialogflowMessage = {
            isFallback: false
        };

        if(request == "getVI") {
            message = await this.prepeareMessage(JSON.stringify(await this.getVisitorInfo(read, token)));
        }

        return message;
    }

    private async getVisitorInfo(read: IRead, token: string) {
        const visitor = await read.getLivechatReader().getLivechatVisitorByToken(token);
        if(!visitor) {throw new Error(Logs.INVALID_VISITOR_TOKEN); }
        

        return visitor.livechatData;
    } 

    

    private async prepeareMessage(m: string): Promise<IDialogflowMessage> {
        const message : IDialogflowMessage = {
            isFallback: false
        }

        let messages: Array<string | IDialogflowQuickReplies> = [];
        messages.push(m);

        message.messages = messages;

        return message;
    }
}

export const DialogflowExt = new DialogflowExtClass();