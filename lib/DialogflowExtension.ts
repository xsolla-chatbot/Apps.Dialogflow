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
            this.executeHandover(response.data, read, modify, sessionId, visitorToken);
            return this.parseRequest(response.data);
        } catch (error) {
            throw new Error(`${ Logs.HTTP_REQUEST_ERROR }`);
        }
    }

    private async executeHandover(response: any, read: IRead, modify: IModify, sessionId: string, token: string) {
        if (!response) { throw new Error(Logs.INVALID_RESPONSE_FROM_DIALOGFLOW_CONTENT_UNDEFINED); }

        const { queryResult: { parameters: { handover } } } = response;
        
        if(handover) {
            performHandover(modify, read, sessionId, token, handover);
        }
    }
}

export const DialogflowExt = new DialogflowExtClass();