import { IHttp, IHttpRequest, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IDialogflowEvent, DialogflowRequestType, IDialogflowMessage, LanguageCode, IDialogflowQuickReplies } from '../enum/Dialogflow';
import { Logs } from '../enum/Logs';
import { Headers } from '../enum/Http';
import { DialogflowClass } from './Dialogflow';
import { createHttpRequest } from './Http';
import { getAppSettingValue } from './Settings';
import { AppSetting } from '../config/Settings';

class DialogflowExtClass extends DialogflowClass {
    public async sendRequest(http: IHttp,
            read: IRead,
            modify: IModify,
            sessionId: string,
            request: IDialogflowEvent | string,
            requestType: DialogflowRequestType): Promise<IDialogflowMessage> {
                
        const serverURL = await this.getServerURL(read, modify, http, sessionId);


        const queryInput = {
            ...requestType === DialogflowRequestType.EVENT && { event: request },
            ...requestType === DialogflowRequestType.MESSAGE && { text: { languageCode: LanguageCode.EN, text: request } },
        };

        let message : IDialogflowMessage = {
            isFallback: false,
        };

        const accessToken = await this.getAccessToken(read, modify, http, sessionId);
        if (!accessToken) { throw Error(Logs.ACCESS_TOKEN_ERROR); }

        const headers = 
        { 'Content-Type': Headers.CONTENT_TYPE_JSON, 
                'Accept': Headers.ACCEPT_JSON,
                'Authorization': 'Bearer ' + accessToken }
        

        let httpRequestContent: IHttpRequest = {
            headers: {
                ...headers
            }
        };

        let response;
        try {
            response = await http.get(serverURL, httpRequestContent);
            
            

            const messages: Array<string | IDialogflowQuickReplies> = [];
            messages.push(response.content);
            message.messages = messages;

            return message;
        } catch (error) {
            throw new Error(`${ Logs.HTTP_REQUEST_ERROR }`);
        }
    }

    protected async getServerURL(read: IRead, modify: IModify, http: IHttp, sessionId: string) {
        const projectId = await getAppSettingValue(read, AppSetting.DialogflowProjectId);

        const accessToken = await this.getAccessToken(read, modify, http, sessionId);
        if (!accessToken) { throw Error(Logs.ACCESS_TOKEN_ERROR); }

        return `https://dialogflow.googleapis.com/v2/projects/${projectId}/agent/entityTypes?key=AIzaSyD8lFAVFJfg9cfZfCdMWGTzp4pqfP4_0aE`;
    }
}

export const DialogflowExt = new DialogflowExtClass();